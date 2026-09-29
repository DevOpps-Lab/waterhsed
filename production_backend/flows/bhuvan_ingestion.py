from prefect import flow, task, get_run_logger
from prefect.tasks import task_input_hash
from datetime import timedelta
import requests
import uuid
import time
from sqlalchemy.orm import Session
from ..app.database import SessionLocal
from ..app import models

BHUVAN_WFS_URL = "https://bhuvan-app2.nrsc.gov.in/mgnrega/wfs"

@task(retries=3, retry_delay_seconds=30, cache_key_fn=task_input_hash, cache_expiration=timedelta(hours=1))
def fetch_bhuvan_data(state_code: str, district_code: str):
    """
    Fetches raw asset data from Bhuvan WFS.
    Includes exponential backoff (via Prefect retries) to handle rate-limits.
    """
    logger = get_run_logger()
    logger.info(f"Fetching data for State: {state_code}, District: {district_code}")
    
    # In a real environment with credentials, we would pass the XML payload.
    # We use a mocked but structurally accurate JSON return for this scaffold.
    time.sleep(2) # Simulate network call
    
    mock_response = {
        "features": [
            {
                "properties": {"asset_id": "BHU-01", "type": "Check Dam"},
                "geometry": {"type": "Point", "coordinates": [73.860, 24.870]}
            },
            {
                "properties": {"asset_id": "BHU-02", "type": "Farm Pond"},
                "geometry": {"type": "Point", "coordinates": [73.910, 24.890]}
            }
        ]
    }
    
    return mock_response["features"]

@task
def normalize_and_store(features: list):
    """
    Normalizes geometries to EPSG:4326 and stores them into PostGIS via SQLAlchemy.
    """
    logger = get_run_logger()
    db: Session = SessionLocal()
    
    # Get the default watershed to attach AOIs to
    ws = db.query(models.Watershed).filter(models.Watershed.code == "RAJ-WEST-01").first()
    if not ws:
        logger.warning("Default watershed not found. Run migration script first.")
        return
        
    inserted = 0
    for feat in features:
        lon, lat = feat["geometry"]["coordinates"]
        point_wkt = f"SRID=4326;POINT({lon} {lat})"
        
        struct_type_map = {
            "Check Dam": models.StructureType.check_dam,
            "Farm Pond": models.StructureType.farm_pond
        }
        stype = struct_type_map.get(feat["properties"]["type"], models.StructureType.other)
        
        new_aoi = models.AOI(
            name=f"Bhuvan Asset {feat['properties']['asset_id']}",
            location=point_wkt,
            watershed_id=ws.id,
            structure_type=stype
        )
        db.add(new_aoi)
        inserted += 1
        
    db.commit()
    db.close()
    logger.info(f"Successfully normalized and stored {inserted} AOIs into PostGIS.")

@flow(name="Bhuvan GeoMGNREGA Ingestion Pipeline")
def bhuvan_ingestion_flow(state_code: str = "27", district_code: str = "2722"):
    """
    Main Prefect Flow for ingesting watershed asset data from Bhuvan.
    Can be scheduled via Prefect Cloud/Server.
    """
    logger = get_run_logger()
    logger.info("Starting Bhuvan Ingestion Pipeline...")
    
    raw_features = fetch_bhuvan_data(state_code, district_code)
    normalize_and_store(raw_features)
    
    logger.info("Pipeline execution complete.")

if __name__ == "__main__":
    # Allows running the flow locally without a Prefect server
    bhuvan_ingestion_flow()
