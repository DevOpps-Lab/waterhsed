"""
WaterSight — Watersheds API
GET    /api/watersheds                  → List all watersheds (GeoJSON)
GET    /api/watersheds/{id}             → Watershed detail
GET    /api/watersheds/{id}/stats       → Time-series KPI stats
GET    /api/watersheds/{id}/sub-watersheds → Sub-watershed list
POST   /api/watersheds                  → Create watershed (admin)
"""
import json
from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from geoalchemy2.functions import ST_AsGeoJSON, ST_Centroid
from datetime import datetime, date

from app.core.database import get_db
from app.models import Watershed, SubWatershed, WatershedStats

router = APIRouter()


# ── Response Schemas ────────────────────────────────────────────────────────

class WatershedListItem(BaseModel):
    id: str
    name: str
    state: str
    district: str
    area_ha: Optional[float]
    program: Optional[str]
    centroid: Optional[dict]   # GeoJSON point


class WatershedDetail(WatershedListItem):
    local_name: Optional[str]
    block: Optional[str]
    village: Optional[str]
    elevation_min_m: Optional[float]
    elevation_max_m: Optional[float]
    source_data: Optional[str]
    boundary: Optional[dict]   # GeoJSON MultiPolygon
    sub_watersheds: List[dict] = []


class StatsPoint(BaseModel):
    date: str
    period_label: str
    ndvi_mean: Optional[float]
    ndvi_max: Optional[float]
    vegetation_ha: Optional[float]
    dense_veg_ha: Optional[float]
    ndwi_mean: Optional[float]
    water_spread_ha: Optional[float]
    moisture_ha: Optional[float]
    bare_land_ha: Optional[float]
    image_count: Optional[int]
    image_pre_count: Optional[int]
    image_post_count: Optional[int]


class WatershedStatsResponse(BaseModel):
    watershed_id: str
    watershed_name: str
    stats: List[StatsPoint]
    summary: dict


# ── Helpers ─────────────────────────────────────────────────────────────────

def _safe_json(val):
    if val is None:
        return None
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return None
    return val


# ── Routes ──────────────────────────────────────────────────────────────────

@router.get("", response_model=List[WatershedListItem])
async def list_watersheds(
    state: Optional[str] = Query(None, description="Filter by state"),
    db: AsyncSession = Depends(get_db),
):
    """Return all watersheds with centroid GeoJSON for map marker placement."""
    q = select(
        Watershed.id,
        Watershed.name,
        Watershed.state,
        Watershed.district,
        Watershed.area_ha,
        Watershed.program,
        ST_AsGeoJSON(Watershed.centroid).label("centroid_geojson"),
    )
    if state:
        q = q.where(Watershed.state == state)
    result = await db.execute(q)
    rows = result.fetchall()

    return [
        WatershedListItem(
            id=str(r.id),
            name=r.name,
            state=r.state,
            district=r.district,
            area_ha=r.area_ha,
            program=r.program,
            centroid=_safe_json(r.centroid_geojson),
        )
        for r in rows
    ]


@router.get("/{watershed_id}", response_model=WatershedDetail)
async def get_watershed(watershed_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get watershed detail including boundary GeoJSON and sub-watershed list."""
    result = await db.execute(
        select(
            Watershed,
            ST_AsGeoJSON(Watershed.boundary).label("boundary_geojson"),
            ST_AsGeoJSON(Watershed.centroid).label("centroid_geojson"),
        ).where(Watershed.id == watershed_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Watershed not found")

    ws = row[0]

    # Fetch sub-watersheds
    sw_result = await db.execute(
        select(
            SubWatershed,
            ST_AsGeoJSON(SubWatershed.centroid).label("centroid_geojson"),
        ).where(SubWatershed.watershed_id == watershed_id)
    )
    sub_watersheds = [
        {
            "id": str(sw.SubWatershed.id),
            "name": sw.SubWatershed.name,
            "code": sw.SubWatershed.code,
            "area_ha": sw.SubWatershed.area_ha,
            "centroid": _safe_json(sw.centroid_geojson),
        }
        for sw in sw_result.fetchall()
    ]

    return WatershedDetail(
        id=str(ws.id),
        name=ws.name,
        local_name=ws.local_name,
        state=ws.state,
        district=ws.district,
        block=ws.block,
        village=ws.village,
        area_ha=ws.area_ha,
        program=ws.program,
        elevation_min_m=ws.elevation_min_m,
        elevation_max_m=ws.elevation_max_m,
        source_data=ws.source_data,
        centroid=_safe_json(row.centroid_geojson),
        boundary=_safe_json(row.boundary_geojson),
        sub_watersheds=sub_watersheds,
    )


@router.get("/{watershed_id}/stats", response_model=WatershedStatsResponse)
async def get_watershed_stats(
    watershed_id: UUID,
    sub_watershed_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Return time-series KPI stats for the watershed trend chart.
    Used by the React dashboard NDVI/water-spread line charts.
    """
    # Fetch watershed name
    ws_result = await db.execute(select(Watershed.name).where(Watershed.id == watershed_id))
    ws_name = ws_result.scalar_one_or_none() or "Unknown"

    # Fetch stats
    q = select(WatershedStats).where(WatershedStats.watershed_id == watershed_id)
    if sub_watershed_id:
        q = q.where(WatershedStats.sub_watershed_id == sub_watershed_id)
    else:
        q = q.where(WatershedStats.sub_watershed_id == None)
    q = q.order_by(WatershedStats.recorded_date)

    result = await db.execute(q)
    rows = result.scalars().all()

    stats_list = [
        StatsPoint(
            date=str(row.recorded_date),
            period_label=row.period_label or str(row.recorded_date),
            ndvi_mean=row.ndvi_mean,
            ndvi_max=row.ndvi_max,
            vegetation_ha=row.vegetation_ha,
            dense_veg_ha=row.dense_veg_ha,
            ndwi_mean=row.ndwi_mean,
            water_spread_ha=row.water_spread_ha,
            moisture_ha=row.moisture_ha,
            bare_land_ha=row.bare_land_ha,
            image_count=row.image_count,
            image_pre_count=row.image_pre_count,
            image_post_count=row.image_post_count,
        )
        for row in rows
    ]

    # Compute summary delta (latest vs earliest)
    summary = {}
    if len(rows) >= 2:
        first, last = rows[0], rows[-1]
        summary = {
            "ndvi_start": first.ndvi_mean,
            "ndvi_end": last.ndvi_mean,
            "ndvi_change": round((last.ndvi_mean - first.ndvi_mean), 3) if last.ndvi_mean and first.ndvi_mean else None,
            "ndvi_pct_change": round(((last.ndvi_mean - first.ndvi_mean) / first.ndvi_mean * 100), 1) if first.ndvi_mean else None,
            "vegetation_ha_start": first.vegetation_ha,
            "vegetation_ha_end": last.vegetation_ha,
            "water_spread_ha_start": first.water_spread_ha,
            "water_spread_ha_end": last.water_spread_ha,
            "period_start": str(first.recorded_date),
            "period_end": str(last.recorded_date),
        }

    return WatershedStatsResponse(
        watershed_id=str(watershed_id),
        watershed_name=ws_name,
        stats=stats_list,
        summary=summary,
    )
