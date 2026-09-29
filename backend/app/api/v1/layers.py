"""
WaterSight — Thematic Layers API
GET /api/layers                        → List layer metadata
GET /api/layers/{id}/point?lat=&lon=   → Sample pixel value at point
GET /api/layers/{id}/geojson           → Return vector layer (drainage)
"""
import json
from typing import Optional, List
from uuid import UUID
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.database import get_db
from app.models import ThematicLayer, LayerType
from app.core.config import settings

router = APIRouter()


class LayerMeta(BaseModel):
    id: str
    watershed_id: Optional[str]
    layer_type: str
    period_label: str
    period_slug: str
    date_start: str
    date_end: str
    satellite_source: str
    tile_url_template: Optional[str]
    stats: Optional[dict]
    colormap: Optional[str]
    pixel_size_m: float
    adapter_class: str


@router.get("", response_model=List[LayerMeta])
async def list_layers(
    watershed_id: Optional[UUID] = None,
    layer_type: Optional[str] = None,
    period_slug: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Return thematic layer catalog entries for the specified watershed."""
    q = select(ThematicLayer)
    if watershed_id:
        q = q.where(ThematicLayer.watershed_id == watershed_id)
    if layer_type:
        q = q.where(ThematicLayer.layer_type == layer_type)
    if period_slug:
        q = q.where(ThematicLayer.period_slug == period_slug)
    q = q.order_by(ThematicLayer.date_start)

    result = await db.execute(q)
    layers = result.scalars().all()

    return [
        LayerMeta(
            id=str(l.id),
            watershed_id=str(l.watershed_id) if l.watershed_id else None,
            layer_type=l.layer_type.value if l.layer_type else "unknown",
            period_label=l.period_label,
            period_slug=l.period_slug,
            date_start=str(l.date_start),
            date_end=str(l.date_end),
            satellite_source=l.satellite_source,
            tile_url_template=l.tile_url_template,
            stats=l.stats,
            colormap=l.colormap,
            pixel_size_m=l.pixel_size_m or 30.0,
            adapter_class=l.adapter_class or "LandsatAdapter",
        )
        for l in layers
    ]


@router.get("/{layer_id}/point")
async def sample_layer_at_point(
    layer_id: UUID,
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    db: AsyncSession = Depends(get_db),
):
    """
    Sample the pixel value of a thematic layer at a given lat/lon.
    Used to display NDVI/NDWI values in image popups.
    """
    result = await db.execute(select(ThematicLayer).where(ThematicLayer.id == layer_id))
    layer = result.scalar_one_or_none()
    if not layer:
        raise HTTPException(status_code=404, detail="Layer not found")

    # Try to sample from local GeoTIFF
    tif_path = Path(settings.PROCESSED_DATA_DIR) / layer.file_path.lstrip("/")
    value = None
    if tif_path.exists():
        try:
            import rasterio
            from rasterio.sample import sample_gen
            with rasterio.open(tif_path) as src:
                values = list(sample_gen(src, [(lon, lat)]))
                val = float(values[0][0])
                if val != src.nodata:
                    value = round(val, 4)
        except Exception as e:
            value = None

    return {
        "layer_id": str(layer_id),
        "layer_type": layer.layer_type.value,
        "period_label": layer.period_label,
        "lat": lat, "lon": lon,
        "value": value,
        "unit": "NDVI" if "ndvi" in layer.layer_type.value else "MNDWI" if "ndwi" in layer.layer_type.value else "class",
    }


@router.get("/{layer_id}/geojson")
async def get_layer_geojson(layer_id: UUID, db: AsyncSession = Depends(get_db)):
    """
    Return vector layer (e.g., drainage network) as GeoJSON.
    Only valid for vector layers (drainage, watershed_boundary).
    """
    result = await db.execute(select(ThematicLayer).where(ThematicLayer.id == layer_id))
    layer = result.scalar_one_or_none()
    if not layer:
        raise HTTPException(status_code=404, detail="Layer not found")

    if layer.layer_type not in (LayerType.drainage,):
        raise HTTPException(status_code=400, detail="Layer is not a vector type")

    geojson_path = Path(settings.PROCESSED_DATA_DIR) / layer.file_path.lstrip("/")
    if not geojson_path.exists():
        raise HTTPException(status_code=404, detail="Layer file not found")

    with open(geojson_path) as f:
        return json.load(f)
