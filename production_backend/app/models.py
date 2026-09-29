from sqlalchemy import Column, String, Float, Boolean, DateTime, ForeignKey, Enum
from sqlalchemy.orm import declarative_base, relationship
import uuid
import datetime
import enum

Base = declarative_base()

class StructureType(str, enum.Enum):
    check_dam = "check_dam"
    farm_pond = "farm_pond"
    percolation_tank = "percolation_tank"
    contour_trench = "contour_trench"
    afforestation = "afforestation"
    other = "other"

class ReportStatus(str, enum.Enum):
    pending_review = "pending_review"
    approved = "approved"
    rejected = "rejected"

class IndexType(str, enum.Enum):
    ndvi = "ndvi"
    ndwi = "ndwi"

class Watershed(Base):
    __tablename__ = "watersheds"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    code = Column(String, unique=True, nullable=False)
    boundary = Column(String, index=True) # WKT
    source = Column(String, default='bhuvan_yuktdhara')

    aois = relationship("AOI", back_populates="watershed")

class AOI(Base):
    __tablename__ = "aois"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    location = Column(String, index=True) # WKT
    watershed_id = Column(String, ForeignKey("watersheds.id"))
    structure_type = Column(Enum(StructureType), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    watershed = relationship("Watershed", back_populates="aois")
    reports = relationship("FieldReport", back_populates="aoi")
    rasters = relationship("SatelliteRaster", back_populates="aoi")

class FieldReport(Base):
    __tablename__ = "field_reports"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    aoi_id = Column(String, ForeignKey("aois.id"))
    photo_s3_key = Column(String, nullable=True)
    captured_at = Column(DateTime, nullable=False)
    cv_water_pct = Column(Float, nullable=True)
    ndwi_value = Column(Float, nullable=True)
    cross_check_flag = Column(Boolean, default=False)
    status = Column(Enum(ReportStatus), default=ReportStatus.pending_review)

    aoi = relationship("AOI", back_populates="reports")

class SatelliteRaster(Base):
    __tablename__ = "satellite_rasters"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    aoi_id = Column(String, ForeignKey("aois.id"))
    scene_date = Column(DateTime, nullable=False)
    cog_s3_key = Column(String, nullable=False)
    cloud_cover = Column(Float, nullable=True)
    index_type = Column(Enum(IndexType), nullable=False)

    aoi = relationship("AOI", back_populates="rasters")
