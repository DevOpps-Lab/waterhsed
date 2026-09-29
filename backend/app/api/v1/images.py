"""
WaterSight — Geo-coded Images API
GET    /api/images              → GeoJSON FeatureCollection of image points
POST   /api/images/upload       → Multipart upload with EXIF extraction
GET    /api/images/{id}         → Image detail with satellite values
GET    /api/images/{id}/file    → Serve image file (proxied from MinIO)
DELETE /api/images/{id}         → Admin only
"""
import io
import json
import uuid as uuidlib
from pathlib import Path
from typing import Optional, List
from uuid import UUID

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2.functions import ST_AsGeoJSON, ST_GeomFromText
from pydantic import BaseModel
from datetime import datetime

from app.core.database import get_db
from app.models import GeoImage, InterventionType, ObservationStage, ImageClassification
from app.core.config import settings

router = APIRouter()

# ── EXIF / Classification utils (inline for self-containment) ───────────────

def _extract_exif_from_bytes(data: bytes) -> Optional[dict]:
    """Extract GPS metadata from image bytes using Pillow + piexif."""
    try:
        from PIL import Image
        import piexif
        import math

        img = Image.open(io.BytesIO(data))
        exif_bytes = img.info.get("exif")
        if not exif_bytes:
            return None
        exif_dict = piexif.load(exif_bytes)
        gps = exif_dict.get("GPS", {})
        if not gps or not gps.get(piexif.GPSIFD.GPSLatitude):
            return None

        def rational_to_float(r):
            return r[0][0]/r[0][1] + r[1][0]/r[1][1]/60 + r[2][0]/r[2][1]/3600

        lat = rational_to_float(gps[piexif.GPSIFD.GPSLatitude])
        if gps.get(piexif.GPSIFD.GPSLatitudeRef) == b"S": lat = -lat
        lon = rational_to_float(gps[piexif.GPSIFD.GPSLongitude])
        if gps.get(piexif.GPSIFD.GPSLongitudeRef) == b"W": lon = -lon

        alt, bearing = None, None
        if piexif.GPSIFD.GPSAltitude in gps:
            a = gps[piexif.GPSIFD.GPSAltitude]
            alt = a[0] / a[1]
        if piexif.GPSIFD.GPSImgDirection in gps:
            b = gps[piexif.GPSIFD.GPSImgDirection]
            bearing = b[0] / b[1]

        exif_e = exif_dict.get("Exif", {})
        exif_0 = exif_dict.get("0th", {})
        dt = exif_e.get(piexif.ExifIFD.DateTimeOriginal) or exif_0.get(piexif.ImageIFD.DateTime)
        if dt and isinstance(dt, bytes):
            dt = dt.decode("utf-8", errors="ignore")

        return {
            "latitude": lat, "longitude": lon,
            "altitude_m": alt, "bearing_deg": bearing,
            "captured_at": dt,
            "camera_make": exif_0.get(piexif.ImageIFD.Make, b"").decode("utf-8", errors="ignore").strip(),
            "camera_model": exif_0.get(piexif.ImageIFD.Model, b"").decode("utf-8", errors="ignore").strip(),
        }
    except Exception:
        return None


def _classify_image_bytes(data: bytes) -> dict:
    """Heuristic RGB image classification — no training data needed."""
    try:
        import numpy as np
        from PIL import Image

        img = Image.open(io.BytesIO(data)).convert("RGB").resize((224, 224))
        arr = np.array(img, dtype=np.float32) / 255.0
        r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
        vgi = (2*g - r - b) / (2*g + r + b + 1e-6)
        blue_ratio = b / (r + g + b + 1e-6)
        brightness = (r + g + b) / 3.0

        veg_score = float(np.mean(vgi > 0.05))
        water_score = float(np.mean(blue_ratio > 0.4))
        bare_score = float(np.mean((brightness > 0.5) & (vgi < 0.02)))

        tags = []
        if veg_score > 0.4:
            label, conf = "dense_vegetation", min(0.95, veg_score * 1.5)
            tags.append("vegetation")
        elif water_score > 0.25:
            label, conf = "water_body_present", min(0.95, water_score * 2.0)
            tags.append("water")
        elif bare_score > 0.5:
            label, conf = "bare_degraded_land", min(0.92, bare_score * 1.3)
            tags.append("bare_soil")
        elif veg_score > 0.1:
            label, conf = "sparse_vegetation", 0.75
            tags.append("sparse_veg")
        else:
            label, conf = "mixed", 0.60
            tags.append("mixed")

        return {"label": label, "confidence": conf, "tags": tags}
    except Exception:
        return {"label": "unclassified", "confidence": 0.0, "tags": []}


async def _save_to_storage(data: bytes, path: str) -> str:
    """Save file to local data directory (MinIO in production)."""
    out_path = Path(settings.DEMO_IMAGES_DIR) / path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    async with aiofiles.open(out_path, "wb") as f:
        await f.write(data)
    return path


# ── Response Schemas ─────────────────────────────────────────────────────────

class ImageFeature(BaseModel):
    """Single image as GeoJSON Feature."""
    type: str = "Feature"
    geometry: dict
    properties: dict


class ImageDetailResponse(BaseModel):
    id: str
    watershed_id: str
    sub_watershed_id: Optional[str]
    latitude: float
    longitude: float
    altitude_m: Optional[float]
    bearing_deg: Optional[float]
    captured_at: Optional[str]
    uploaded_at: str
    file_path: str
    thumbnail_path: Optional[str]
    intervention_type: str
    observation_stage: str
    notes: Optional[str]
    classification_label: Optional[str]
    classification_confidence: Optional[float]
    classification_tags: Optional[List[str]]
    ndvi_at_point: Optional[float]
    ndwi_at_point: Optional[float]
    lulc_class_at_point: Optional[str]
    slope_at_point: Optional[float]
    has_valid_gps: bool
    is_flagged: bool
    exif_raw: Optional[dict]


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=dict)
async def list_images(
    watershed_id: Optional[UUID] = None,
    stage: Optional[str] = Query(None, description="pre | during | post"),
    intervention_type: Optional[str] = None,
    sub_watershed_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Returns GeoJSON FeatureCollection of all geo-coded image points.
    Supports filtering by watershed, stage, intervention type.
    Used by MapLibre to render clickable markers.
    """
    q = select(
        GeoImage,
        ST_AsGeoJSON(GeoImage.location).label("location_geojson"),
    )
    filters = []
    if watershed_id:
        filters.append(GeoImage.watershed_id == watershed_id)
    if stage:
        filters.append(GeoImage.observation_stage == stage)
    if intervention_type:
        filters.append(GeoImage.intervention_type == intervention_type)
    if sub_watershed_id:
        filters.append(GeoImage.sub_watershed_id == sub_watershed_id)
    if filters:
        q = q.where(and_(*filters))

    result = await db.execute(q)
    rows = result.fetchall()

    features = []
    for row in rows:
        img = row.GeoImage
        geom = json.loads(row.location_geojson) if row.location_geojson else None
        coords = geom["coordinates"] if geom else [0, 0]
        features.append({
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "id": str(img.id),
                "watershed_id": str(img.watershed_id),
                "intervention_type": img.intervention_type.value if img.intervention_type else None,
                "observation_stage": img.observation_stage.value if img.observation_stage else None,
                "captured_at": str(img.captured_at) if img.captured_at else None,
                "classification_label": img.classification_label.value if img.classification_label else None,
                "classification_confidence": img.classification_confidence,
                "ndvi_at_point": img.ndvi_at_point,
                "ndwi_at_point": img.ndwi_at_point,
                "lulc_class_at_point": img.lulc_class_at_point,
                "thumbnail_path": img.thumbnail_path,
                "notes": img.notes,
                "is_flagged": img.is_flagged,
            }
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "total": len(features),
    }


@router.post("/upload", status_code=201)
async def upload_image(
    file: UploadFile = File(..., description="JPEG/PNG field photograph"),
    watershed_id: UUID = Form(...),
    intervention_type: str = Form("other"),
    observation_stage: str = Form("post"),
    notes: Optional[str] = Form(None),
    sub_watershed_id: Optional[str] = Form(None),
    # Manual GPS override (if EXIF missing)
    manual_lat: Optional[float] = Form(None),
    manual_lon: Optional[float] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a geo-coded field photograph.
    1. Read file bytes
    2. Extract EXIF GPS (or use manual_lat/lon)
    3. Run heuristic image classification
    4. Save to local storage
    5. Insert into PostGIS with POINT geometry
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are accepted")

    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 20MB)")

    # EXIF extraction
    exif = _extract_exif_from_bytes(data)
    lat = exif["latitude"] if exif else manual_lat
    lon = exif["longitude"] if exif else manual_lon
    has_valid_gps = (lat is not None and lon is not None)

    if not has_valid_gps:
        raise HTTPException(
            status_code=422,
            detail="No GPS data found in EXIF. Provide manual_lat and manual_lon."
        )

    # Classification
    classification = _classify_image_bytes(data)

    # Save file
    image_id = uuidlib.uuid4()
    filename = f"{image_id}_{file.filename}"
    file_path = f"uploads/{watershed_id}/{filename}"
    await _save_to_storage(data, file_path)

    # Parse captured_at
    captured_at = None
    if exif and exif.get("captured_at"):
        try:
            dt_str = exif["captured_at"].replace(":", "-", 2)
            captured_at = datetime.fromisoformat(dt_str)
        except Exception:
            pass

    # Insert into DB
    image = GeoImage(
        id=image_id,
        watershed_id=watershed_id,
        sub_watershed_id=UUID(sub_watershed_id) if sub_watershed_id else None,
        location=f"SRID=4326;POINT({lon} {lat})",
        altitude_m=exif.get("altitude_m") if exif else None,
        bearing_deg=exif.get("bearing_deg") if exif else None,
        captured_at=captured_at,
        file_path=file_path,
        file_size_bytes=len(data),
        mime_type=file.content_type,
        intervention_type=intervention_type,
        observation_stage=observation_stage,
        notes=notes,
        classification_label=classification["label"],
        classification_confidence=classification["confidence"],
        classification_tags=classification["tags"],
        has_valid_gps=has_valid_gps,
        exif_raw=exif,
    )
    db.add(image)
    await db.commit()
    await db.refresh(image)

    return {
        "id": str(image.id),
        "message": "Image uploaded and processed successfully",
        "gps": {"lat": lat, "lon": lon},
        "exif_extracted": exif is not None,
        "classification": classification,
        "file_path": file_path,
    }


@router.get("/{image_id}", response_model=ImageDetailResponse)
async def get_image(image_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get full image detail including satellite values at the GPS point."""
    result = await db.execute(
        select(
            GeoImage,
            func.ST_X(GeoImage.location).label("lon"),
            func.ST_Y(GeoImage.location).label("lat"),
        ).where(GeoImage.id == image_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Image not found")

    img = row.GeoImage
    return ImageDetailResponse(
        id=str(img.id),
        watershed_id=str(img.watershed_id),
        sub_watershed_id=str(img.sub_watershed_id) if img.sub_watershed_id else None,
        latitude=row.lat,
        longitude=row.lon,
        altitude_m=img.altitude_m,
        bearing_deg=img.bearing_deg,
        captured_at=str(img.captured_at) if img.captured_at else None,
        uploaded_at=str(img.uploaded_at),
        file_path=img.file_path,
        thumbnail_path=img.thumbnail_path,
        intervention_type=img.intervention_type.value if img.intervention_type else "other",
        observation_stage=img.observation_stage.value if img.observation_stage else "post",
        notes=img.notes,
        classification_label=img.classification_label.value if img.classification_label else None,
        classification_confidence=img.classification_confidence,
        classification_tags=img.classification_tags,
        ndvi_at_point=img.ndvi_at_point,
        ndwi_at_point=img.ndwi_at_point,
        lulc_class_at_point=img.lulc_class_at_point,
        slope_at_point=img.slope_at_point,
        has_valid_gps=img.has_valid_gps,
        is_flagged=img.is_flagged,
        exif_raw=img.exif_raw,
    )


@router.get("/{image_id}/file")
async def serve_image(image_id: UUID, db: AsyncSession = Depends(get_db)):
    """Serve the original image file (from local storage for demo)."""
    result = await db.execute(select(GeoImage.file_path).where(GeoImage.id == image_id))
    file_path = result.scalar_one_or_none()
    if not file_path:
        raise HTTPException(status_code=404, detail="Image not found")

    full_path = Path(settings.DEMO_IMAGES_DIR) / file_path
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found in storage")

    async def iter_file():
        async with aiofiles.open(full_path, "rb") as f:
            while chunk := await f.read(65536):
                yield chunk

    return StreamingResponse(iter_file(), media_type="image/jpeg")
