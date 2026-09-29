import os
import uuid
import time
from datetime import datetime
from prefect import flow, task, get_run_logger
from sqlalchemy.orm import Session
from ..app.database import SessionLocal
from ..app import models

# In a real environment, you must authenticate GEE:
# import ee
# ee.Initialize()

@task(retries=2, retry_delay_seconds=60)
def process_gee_scene(aoi_id: uuid.UUID, geometry_wkt: str, index_type: str):
    """
    Queries Google Earth Engine for the Sentinel-2 scene, computes NDVI/NDWI,
    and exports a GeoTIFF to local storage (or directly to GCS/S3).
    """
    logger = get_run_logger()
    logger.info(f"Querying GEE for AOI: {aoi_id} (Target: {index_type})")
    
    # --- MOCKED GEE LOGIC ---
    # aoi_geom = ee.Geometry.Polygon(parse_wkt(geometry_wkt))
    # collection = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")\
    #     .filterBounds(aoi_geom)\
    #     .filterDate('2024-08-20', '2024-09-27')\
    #     .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
    # image = collection.first()
    # if index_type == "ndvi":
    #     computed = image.normalizedDifference(['B8', 'B4']).rename('NDVI')
    #
    # ee.batch.Export.image.toCloudStorage(...)
    
    time.sleep(2) # Simulate GEE computation time
    mock_geotiff_path = f"/tmp/{aoi_id}_{index_type}_raw.tif"
    
    logger.info(f"GEE export completed: {mock_geotiff_path}")
    return mock_geotiff_path

@task
def convert_to_cog_and_upload(raw_tif_path: str, aoi_id: uuid.UUID, index_type: str):
    """
    Uses rio-cogeo to convert the raw GeoTIFF to a Cloud-Optimized GeoTIFF,
    then uploads it to the S3 bucket.
    """
    logger = get_run_logger()
    logger.info(f"Converting {raw_tif_path} to COG via rio-cogeo...")
    
    # --- MOCKED RIO-COGEO LOGIC ---
    # from rio_cogeo.cogeo import cog_translate
    # cog_translate(raw_tif_path, out_cog_path, config=...)
    # s3_client.upload_file(out_cog_path, "watersight-bucket", s3_key)
    
    time.sleep(1)
    s3_key = f"rasters/{aoi_id}/{index_type}_{datetime.utcnow().strftime('%Y%m%d')}_cog.tif"
    logger.info(f"Uploaded COG to S3: s3://watersight-bucket/{s3_key}")
    return s3_key

@task
def record_raster_in_db(aoi_id: uuid.UUID, s3_key: str, index_type: str):
    logger = get_run_logger()
    db: Session = SessionLocal()
    
    new_raster = models.SatelliteRaster(
        aoi_id=aoi_id,
        scene_date=datetime.utcnow(),
        cog_s3_key=s3_key,
        cloud_cover=12.5, # Mock value
        index_type=models.IndexType(index_type)
    )
    db.add(new_raster)
    db.commit()
    db.close()
    
    logger.info(f"Database updated with new {index_type} raster for AOI {aoi_id}.")

@flow(name="GEE Live Satellite Processing")
def satellite_pipeline_flow(aoi_id: str, geometry_wkt: str):
    """
    Triggered nightly or immediately upon AOI creation.
    Computes both NDVI and NDWI for the target area.
    """
    logger = get_run_logger()
    logger.info(f"Starting Live Satellite Pipeline for AOI: {aoi_id}")
    
    aoi_uuid = uuid.UUID(aoi_id)
    
    for idx in ["ndvi", "ndwi"]:
        raw_tif = process_gee_scene(aoi_uuid, geometry_wkt, idx)
        cog_key = convert_to_cog_and_upload(raw_tif, aoi_uuid, idx)
        record_raster_in_db(aoi_uuid, cog_key, idx)
        
    logger.info("Satellite Pipeline fully completed.")

if __name__ == "__main__":
    satellite_pipeline_flow(
        aoi_id="22222222-2222-2222-2222-222222222222", 
        geometry_wkt="POINT(73.857 24.862)"
    )
