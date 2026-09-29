import uuid
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db

client = TestClient(app)

# Mock data
mock_watershed = {
    "id": uuid.UUID("11111111-1111-1111-1111-111111111111"),
    "name": "Rajsamand Watershed (West)",
    "code": "RAJ-WEST-01"
}

class MockSession:
    def query(self, model):
        self.model = model
        return self
        
    def filter(self, *args, **kwargs):
        return self
        
    def all(self):
        if self.model.__name__ == 'Watershed':
            return [mock_watershed]
        return []
        
    def first(self):
        if self.model.__name__ == 'Watershed':
            return mock_watershed
        return None
        
    def add(self, instance):
        pass
        
    def commit(self):
        pass

def override_get_db():
    yield MockSession()

app.dependency_overrides[get_db] = override_get_db

def test_endpoints():
    print("Running Tests for Phase 1 Endpoints...")
    
    # Test 1: GET /watersheds
    res = client.get("/watersheds")
    print(f"GET /watersheds -> Status: {res.status_code}")
    assert res.status_code == 200
    print("/watersheds endpoint is working")
    
    # Test 2: GET /watersheds/{id}
    res = client.get("/watersheds/11111111-1111-1111-1111-111111111111")
    print(f"GET /watersheds/{{id}} -> Status: {res.status_code}")
    assert res.status_code == 200
    print("/watersheds/{id} endpoint is working")

    # Test 3: POST /field_reports
    res = client.post("/field_reports?aoi_id=22222222-2222-2222-2222-222222222222&captured_at=2024-09-27T10:00:00Z")
    print(f"POST /field_reports -> Status: {res.status_code}")
    assert res.status_code == 200
    data = res.json()
    assert "upload_url" in data
    print(f"/field_reports returned S3 presigned URL: {data['upload_url']}")

if __name__ == "__main__":
    test_endpoints()
    print("\nAll tests passed successfully! Phase 1 API is solid.")
