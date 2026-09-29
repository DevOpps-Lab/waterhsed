"""
WaterSight — SQLAlchemy + PostGIS Database Models
"""
import uuid
from datetime import datetime
from typing import Optional, List

from sqlalchemy import (
    Column, String, Float, Boolean, Integer, Text, Date,
    DateTime, ForeignKey, Enum as SAEnum, BigInteger, Index, ARRAY
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, INET
from sqlalchemy.orm import relationship, DeclarativeBase
from geoalchemy2 import Geometry
import enum


class Base(DeclarativeBase):
    pass


# ── Enums ──────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    admin = "admin"
    field_officer = "field_officer"
    analyst = "analyst"
    public = "public"


class InterventionType(str, enum.Enum):
    check_dam = "check_dam"
    farm_pond = "farm_pond"
    contour_trench = "contour_trench"
    afforestation = "afforestation"
    gully_plug = "gully_plug"
    soil_bunding = "soil_bunding"
    percolation_tank = "percolation_tank"
    nala_bunding = "nala_bunding"
    other = "other"


class ObservationStage(str, enum.Enum):
    pre = "pre"
    during = "during"
    post = "post"


class LayerType(str, enum.Enum):
    ndvi = "ndvi"
    ndwi = "ndwi"
    mndwi = "mndwi"
    lulc = "lulc"
    drainage = "drainage"
    slope = "slope"
    aspect = "aspect"
    change_detection = "change_detection"
    water_spread = "water_spread"


class ImageClassification(str, enum.Enum):
    water_body_present = "water_body_present"
    dense_vegetation = "dense_vegetation"
    sparse_vegetation = "sparse_vegetation"
    bare_degraded_land = "bare_degraded_land"
    structure_intact = "structure_intact"
    structure_damaged = "structure_damaged"
    soil_erosion_visible = "soil_erosion_visible"
    mixed = "mixed"
    unclassified = "unclassified"


# ── Models ─────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), nullable=False, default=UserRole.analyst)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    last_login_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class Watershed(Base):
    __tablename__ = "watersheds"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    local_name = Column(String(255))
    state = Column(String(100), nullable=False)
    district = Column(String(100), nullable=False)
    block = Column(String(100))
    village = Column(String(100))
    area_ha = Column(Float)
    boundary = Column(Geometry("MULTIPOLYGON", srid=4326), nullable=False)
    centroid = Column(Geometry("POINT", srid=4326))
    elevation_min_m = Column(Float)
    elevation_max_m = Column(Float)
    source_data = Column(String(100), default="manual")
    program = Column(String(255))
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    sub_watersheds = relationship("SubWatershed", back_populates="watershed", cascade="all, delete-orphan")
    geo_images = relationship("GeoImage", back_populates="watershed", cascade="all, delete-orphan")
    thematic_layers = relationship("ThematicLayer", back_populates="watershed", cascade="all, delete-orphan")
    stats = relationship("WatershedStats", back_populates="watershed", cascade="all, delete-orphan")


class SubWatershed(Base):
    __tablename__ = "sub_watersheds"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    watershed_id = Column(UUID(as_uuid=True), ForeignKey("watersheds.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    code = Column(String(50))
    area_ha = Column(Float)
    boundary = Column(Geometry("POLYGON", srid=4326))
    centroid = Column(Geometry("POINT", srid=4326))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    watershed = relationship("Watershed", back_populates="sub_watersheds")


class GeoImage(Base):
    __tablename__ = "geo_images"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    watershed_id = Column(UUID(as_uuid=True), ForeignKey("watersheds.id", ondelete="CASCADE"), nullable=False)
    sub_watershed_id = Column(UUID(as_uuid=True), ForeignKey("sub_watersheds.id", ondelete="SET NULL"))

    # Spatial
    location = Column(Geometry("POINT", srid=4326), nullable=False)
    altitude_m = Column(Float)
    bearing_deg = Column(Float)
    gps_accuracy_m = Column(Float)

    # Temporal
    captured_at = Column(DateTime(timezone=True))
    uploaded_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    # Storage
    file_path = Column(String(500), nullable=False)
    thumbnail_path = Column(String(500))
    file_size_bytes = Column(BigInteger)
    mime_type = Column(String(50), default="image/jpeg")

    # Field metadata
    intervention_type = Column(SAEnum(InterventionType), nullable=False, default=InterventionType.other)
    observation_stage = Column(SAEnum(ObservationStage), nullable=False, default=ObservationStage.post)
    notes = Column(Text)

    # CV classification
    classification_label = Column(SAEnum(ImageClassification), default=ImageClassification.unclassified)
    classification_confidence = Column(Float)
    classification_tags = Column(ARRAY(String))

    # Satellite values at this point
    ndvi_at_point = Column(Float)
    ndwi_at_point = Column(Float)
    lulc_class_at_point = Column(String(100))
    slope_at_point = Column(Float)

    # Quality
    has_valid_gps = Column(Boolean, default=True)
    is_flagged = Column(Boolean, default=False)
    flag_reason = Column(Text)
    exif_raw = Column(JSONB)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    watershed = relationship("Watershed", back_populates="geo_images")


class ThematicLayer(Base):
    __tablename__ = "thematic_layers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    watershed_id = Column(UUID(as_uuid=True), ForeignKey("watersheds.id", ondelete="CASCADE"))
    layer_type = Column(SAEnum(LayerType), nullable=False)
    period_label = Column(String(50), nullable=False)
    period_slug = Column(String(50), nullable=False)
    date_start = Column(Date, nullable=False)
    date_end = Column(Date, nullable=False)
    satellite_source = Column(String(100), nullable=False, default="Landsat8_C2L2")
    scene_id = Column(String(200))
    file_path = Column(String(500), nullable=False)
    tile_url_template = Column(String(500))
    bbox = Column(Geometry("POLYGON", srid=4326))
    srid = Column(Integer, default=4326)
    pixel_size_m = Column(Float, default=30.0)
    stats = Column(JSONB)
    colormap = Column(String(50), default="RdYlGn")
    adapter_class = Column(String(100), default="LandsatAdapter")
    processing_notes = Column(Text)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    watershed = relationship("Watershed", back_populates="thematic_layers")


class WatershedStats(Base):
    __tablename__ = "watershed_stats"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    watershed_id = Column(UUID(as_uuid=True), ForeignKey("watersheds.id", ondelete="CASCADE"), nullable=False)
    sub_watershed_id = Column(UUID(as_uuid=True), ForeignKey("sub_watersheds.id", ondelete="SET NULL"))
    recorded_date = Column(Date, nullable=False)
    period_label = Column(String(50))

    # Vegetation
    ndvi_mean = Column(Float)
    ndvi_min = Column(Float)
    ndvi_max = Column(Float)
    vegetation_ha = Column(Float)
    dense_veg_ha = Column(Float)

    # Water
    ndwi_mean = Column(Float)
    water_spread_ha = Column(Float)
    moisture_ha = Column(Float)

    # Land cover
    bare_land_ha = Column(Float)
    agricultural_ha = Column(Float)
    built_up_ha = Column(Float)

    # Images
    image_count = Column(Integer, default=0)
    image_pre_count = Column(Integer, default=0)
    image_post_count = Column(Integer, default=0)

    source_layer_id = Column(UUID(as_uuid=True), ForeignKey("thematic_layers.id"))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    watershed = relationship("Watershed", back_populates="stats")


class Report(Base):
    __tablename__ = "reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    watershed_id = Column(UUID(as_uuid=True), ForeignKey("watersheds.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(500), nullable=False)
    generated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    generated_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    file_path = Column(String(500))
    summary_stats = Column(JSONB)
    status = Column(String(20), default="pending")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    action = Column(String(100), nullable=False)
    entity_type = Column(String(100))
    entity_id = Column(UUID(as_uuid=True))
    ip_address = Column(INET)
    user_agent = Column(Text)
    metadata = Column(JSONB)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
