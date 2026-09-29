import uuid
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware

from . import models, database

# Create tables for dev (in production, use Alembic)
try:
    models.Base.metadata.create_all(bind=database.engine)
except Exception as e:
    print(f"Warning: Could not connect to database on startup: {e}")

app = FastAPI(title="WaterSight Production API - Phase 1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/watersheds")
def get_watersheds(db: Session = Depends(database.get_db)):
    return db.query(models.Watershed).all()

@app.get("/watersheds/{watershed_id}")
def get_watershed(watershed_id: str, db: Session = Depends(database.get_db)):
    watershed = db.query(models.Watershed).filter(models.Watershed.id == str(watershed_id)).first()
    if not watershed:
        raise HTTPException(status_code=404, detail="Watershed not found")
    return watershed

@app.get("/aois")
def get_aois(
    bbox: Optional[str] = Query(None, description="Bounding box 'xmin,ymin,xmax,ymax'"),
    db: Session = Depends(database.get_db)
):
    aois = db.query(models.AOI).all()
    # Format into GeoJSON for the frontend!
    features = []
    for aoi in aois:
        # location is stored as SRID=4326;POINT(lon lat)
        try:
            coords = aoi.location.replace("SRID=4326;POINT(", "").replace(")", "").split(" ")
            lon, lat = float(coords[0]), float(coords[1])
        except:
            lon, lat = 0.0, 0.0
            
        features.append({
            "type": "Feature",
            "geometry": { "type": "Point", "coordinates": [lon, lat] },
            "properties": {
                "id": str(aoi.id),
                "intervention_type": aoi.structure_type.value,
                "observation_stage": "post", # Mock for demo UI
                "captured_at": aoi.created_at.strftime("%Y-%m-%d"),
                "classification_label": "water_body_present",
                "classification_confidence": 0.95,
                "ndvi_at_point": 0.45,
                "ndwi_at_point": 0.35,
                "lulc_class_at_point": "Water/Wetland",
                "notes": "Live fetched from SQLite Backend",
                "thumbnail_path": "/images/img_check_dam_post.jpg"
            }
        })
        
    return {
        "type": "FeatureCollection",
        "features": features
    }

@app.get("/aois/{aoi_id}")
def get_aoi(aoi_id: str, db: Session = Depends(database.get_db)):
    aoi = db.query(models.AOI).filter(models.AOI.id == str(aoi_id)).first()
    if not aoi:
        raise HTTPException(status_code=404, detail="AOI not found")
    return aoi

@app.post("/aois")
def create_aoi(
    name: str, 
    lon: float, 
    lat: float, 
    watershed_id: str, 
    structure_type: str,
    db: Session = Depends(database.get_db)
):
    aoi_id = str(uuid.uuid4())
    point_wkt = f"SRID=4326;POINT({lon} {lat})"
    
    new_aoi = models.AOI(
        id=aoi_id,
        name=name,
        location=point_wkt,
        watershed_id=str(watershed_id),
        structure_type=models.StructureType(structure_type)
    )
    db.add(new_aoi)
    db.commit()
    
    print(f"🚀 Triggering Satellite Pipeline for new AOI {aoi_id}")
    return {"status": "created", "aoi_id": aoi_id, "pipeline_triggered": True}

@app.get("/aois/{aoi_id}/reports")
def get_aoi_reports(aoi_id: str, db: Session = Depends(database.get_db)):
    reports = db.query(models.FieldReport).filter(models.FieldReport.aoi_id == str(aoi_id)).all()
    return reports

@app.post("/field_reports")
def create_field_report(aoi_id: str, captured_at: str, db: Session = Depends(database.get_db)):
    report_id = str(uuid.uuid4())
    s3_key = f"reports/{aoi_id}/{report_id}.jpg"
    
    presigned_url = f"https://s3.amazonaws.com/watersight-bucket/{s3_key}?AWSAccessKeyId=MOCK&Signature=MOCK"
    
    report = models.FieldReport(
        id=report_id,
        aoi_id=str(aoi_id),
        photo_s3_key=s3_key,
        captured_at=captured_at
    )
    db.add(report)
    db.commit()
    
    return {
        "report_id": report_id,
        "upload_url": presigned_url
    }

@app.patch("/field_reports/{report_id}/confirm-upload")
def confirm_upload(report_id: str, db: Session = Depends(database.get_db)):
    report = db.query(models.FieldReport).filter(models.FieldReport.id == str(report_id)).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    report.status = models.ReportStatus.pending_review
    db.commit()
    
    return {"status": "upload_confirmed", "report_id": report_id}

@app.get("/field_reports")
def get_all_reports(
    flagged: Optional[bool] = Query(None, description="Filter by cross_check_flag"),
    db: Session = Depends(database.get_db)
):
    query = db.query(models.FieldReport)
    if flagged is not None:
        query = query.filter(models.FieldReport.cross_check_flag == flagged)
    
    reports = query.all()
    return [
        {
            "id": r.id,
            "aoi_id": r.aoi_id,
            "photo_url": f"https://s3.amazonaws.com/watersight-bucket/{r.photo_s3_key}" if r.photo_s3_key else None,
            "cv_water_pct": r.cv_water_pct,
            "ndwi_value": r.ndwi_value,
            "is_flagged": r.cross_check_flag
        } for r in reports
    ]
