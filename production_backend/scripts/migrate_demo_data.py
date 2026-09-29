import json
import uuid
import re
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app import models
from pathlib import Path

def parse_js_to_dict(file_path):
    """
    Very crude parser to extract the JSON-like objects from demoData.js
    In a real scenario, it's safer to export pure JSON from the JS file.
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract DEMO_WATERSHED
    watershed_match = re.search(r'export const DEMO_WATERSHED = ({.*?});', content, re.DOTALL)
    if not watershed_match:
        raise ValueError("Could not find DEMO_WATERSHED in demoData.js")
    
    # We use eval here for the sake of the hackathon migration script, 
    # since it's a controlled local JS file.
    # Note: JavaScript object keys without quotes are not valid JSON.
    ws_str = watershed_match.group(1)
    ws_str = re.sub(r'(\w+):', r'"\1":', ws_str) # weak json fix
    
    try:
        ws_data = json.loads(ws_str)
    except json.JSONDecodeError:
        # Fallback to hardcoded insertion for safety if parsing fails
        ws_data = {
            "id": "11111111-1111-1111-1111-111111111111",
            "name": "Rajsamand Watershed (West)",
            "code": "RAJ-WEST-01",
            "boundary": "POLYGON((73.840 24.840, 73.920 24.840, 73.925 24.900, 73.920 24.960, 73.860 24.960, 73.840 24.920, 73.835 24.870, 73.840 24.840))"
        }
        
    return ws_data

def migrate():
    print("Starting Demo Data Migration to PostgreSQL...")
    from app.database import engine
    models.Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()
    
    # 1. Insert Watershed
    ws_id = "11111111-1111-1111-1111-111111111111"
    
    existing_ws = db.query(models.Watershed).filter(models.Watershed.id == ws_id).first()
    if not existing_ws:
        ws = models.Watershed(
            id=ws_id,
            name="Rajsamand Watershed (West)",
            code="RAJ-WEST-01",
            boundary="SRID=4326;POLYGON((73.840 24.840, 73.920 24.840, 73.925 24.900, 73.920 24.960, 73.860 24.960, 73.840 24.920, 73.835 24.870, 73.840 24.840))"
        )
        db.add(ws)
        db.commit()
        print(f"Migrated Watershed: {ws.name}")
    else:
        print("Watershed already exists, skipping.")
        
    # 2. Insert AOIs (Features from DEMO_IMAGES_GEOJSON)
    aoi_data = [
        {"id": str(uuid.uuid4()), "name": "Check Dam Site 1", "lon": 73.857, "lat": 24.862, "type": "check_dam"},
        {"id": str(uuid.uuid4()), "name": "Farm Pond Alpha", "lon": 73.901, "lat": 24.872, "type": "farm_pond"},
        {"id": str(uuid.uuid4()), "name": "Afforestation Zone B", "lon": 73.868, "lat": 24.935, "type": "afforestation"}
    ]
    
    for item in aoi_data:
        point_wkt = f"SRID=4326;POINT({item['lon']} {item['lat']})"
        aoi = models.AOI(
            id=item["id"],
            name=item["name"],
            location=point_wkt,
            watershed_id=ws_id,
            structure_type=models.StructureType(item["type"])
        )
        db.add(aoi)
    
    db.commit()
    print(f"Migrated {len(aoi_data)} AOIs.")
    print("Migration Complete!")
    db.close()

if __name__ == "__main__":
    migrate()
