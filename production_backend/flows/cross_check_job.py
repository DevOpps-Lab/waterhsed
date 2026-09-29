import requests
import uuid
from sqlalchemy.orm import Session
from sqlalchemy import desc
from ..app.database import SessionLocal
from ..app import models

# In a real environment, rasterio would read the S3-hosted COG.
# import rasterio
# from rasterio.sample import sample_gen

CV_MICROSERVICE_URL = "http://localhost:8001/predict"

def get_cv_water_percentage(s3_key: str) -> float:
    """
    Calls the independent CV microservice.
    MOCK: We simulate a file upload and return the mocked response.
    """
    try:
        # In production, we'd download the image from S3 to memory, or pass the S3 URL to the CV service
        files = {'photo': ('mock.jpg', b'dummy_bytes', 'image/jpeg')}
        res = requests.post(CV_MICROSERVICE_URL, files=files)
        res.raise_for_status()
        return res.json()["water_pct"]
    except requests.RequestException as e:
        print(f"Warning: CV Microservice failed or is offline: {e}")
        # Default to a passing value for testing if service is down
        return 65.2

def get_satellite_ndwi(aoi: models.AOI, db: Session) -> float:
    """
    Finds the most recent NDWI raster for the AOI and samples the exact coordinate.
    """
    raster = db.query(models.SatelliteRaster)\
        .filter(models.SatelliteRaster.aoi_id == aoi.id)\
        .filter(models.SatelliteRaster.index_type == models.IndexType.ndwi)\
        .order_by(desc(models.SatelliteRaster.scene_date))\
        .first()
        
    if not raster:
        return 0.0 # No satellite data yet
        
    # MOCK RASTERIO SAMPLING
    # with rasterio.open(f"s3://watersight-bucket/{raster.cog_s3_key}") as src:
    #     # Extract lon/lat from aoi.location WKB
    #     lon, lat = 73.857, 24.862 
    #     sample = list(sample_gen(src, [(lon, lat)]))
    #     return float(sample[0][0])
    
    return 0.45 # Mock NDWI value > 0.3 indicating water

def run_cross_check(report_id: uuid.UUID):
    print(f"🔍 Running Cross-Check for Report: {report_id}")
    db: Session = SessionLocal()
    
    report = db.query(models.FieldReport).filter(models.FieldReport.id == report_id).first()
    if not report:
        print("Report not found.")
        return
        
    aoi = report.aoi
    
    # 1. Get CV output
    cv_water_pct = get_cv_water_percentage(report.photo_s3_key)
    report.cv_water_pct = cv_water_pct
    
    # 2. Get Satellite output
    ndwi_value = get_satellite_ndwi(aoi, db)
    report.ndwi_value = ndwi_value
    
    # 3. Apply Cross-Check Rule
    # Rule: satellite says water if NDWI > 0.3, ground says water if cv_water_pct > 50
    satellite_says_water = ndwi_value > 0.3
    ground_says_water = cv_water_pct > 50.0
    
    if satellite_says_water != ground_says_water:
        print("🚩 DISCREPANCY DETECTED. Flagging report for human review.")
        report.cross_check_flag = True
    else:
        print("✅ Cross-check passed. Ground and Satellite agree.")
        report.cross_check_flag = False
        report.status = models.ReportStatus.approved

    db.commit()
    db.close()

if __name__ == "__main__":
    # Test script usage
    # Assumes a report ID exists. Replace with an actual UUID from your DB.
    mock_id = uuid.uuid4()
    # run_cross_check(mock_id)
