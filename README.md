# WaterSight 🌊
## Geospatial Visualization & Analysis Platform for Watershed Development

> **Smart India Hackathon 2024 — SIH Problem Statement**  
> *Application of Geospatial Techniques for Visualization and Analysis to Interpret Geo-Coded Images to Enhance Watershed Development Outcomes*

---

## Quick Start (One-Command Demo)

```bash
# Clone/navigate to project
cd watersight

# Start everything with Docker Compose
docker-compose up --build

# App will be available at:
# Frontend:  http://localhost:3000
# API Docs:  http://localhost:8080/docs
# MinIO:     http://localhost:9001  (admin/minioadmin)
# TiTiler:   http://localhost:8000/docs
```

### Non-Docker Setup (Local Dev)

**Prerequisites:** Node.js 20+, Python 3.11+, PostgreSQL 15 + PostGIS

```bash
# 1. Database setup
createdb watersight
psql watersight -f db/schema.sql
psql watersight -f db/seed_data.sql

# 2. Run geoprocessing pipeline (pre-compute demo layers)
cd pipeline
pip install -r ../backend/requirements.txt
python run_pipeline.py --all --images

# 3. Start FastAPI backend
cd ../backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8080

# 4. Start React frontend (new terminal)
cd ../frontend
npm install
npm run dev
# → App at http://localhost:5173
```

---

## Project Architecture

```
watersight/
├── db/                     # PostgreSQL + PostGIS schema & seed data
│   ├── schema.sql          # 7-table schema (watersheds, geo_images, thematic_layers...)
│   └── seed_data.sql       # Rajsamand watershed demo data
│
├── pipeline/               # Geoprocessing pipeline (Python)
│   └── run_pipeline.py     # NDVI/NDWI/drainage computation + demo image generation
│
├── backend/                # FastAPI REST API
│   ├── app/
│   │   ├── main.py         # FastAPI app entry point
│   │   ├── models.py       # SQLAlchemy ORM models
│   │   ├── core/           # Config, security (JWT), database session
│   │   └── api/v1/         # Route modules: auth, watersheds, images, layers, analytics, reports
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/               # React + MapLibre GL JS web app
│   ├── src/
│   │   ├── App.jsx         # Main application (map, dashboard, upload)
│   │   ├── api.js          # Centralized API client
│   │   ├── demoData.js     # Pre-loaded demo data (Rajsamand)
│   │   └── index.css       # Design system (dark theme, glassmorphism)
│   ├── vite.config.js
│   └── Dockerfile
│
└── docker-compose.yml      # One-command deployment
```

---

## Demo Site: Rajsamand Watershed, Rajasthan

| Attribute | Value |
|---|---|
| Location | Rajsamand District, Rajasthan |
| Area | 2,387.5 ha |
| Program | PMKSY-IWMP |
| Sub-watersheds | 3 (Kanthariya Nala, Railmagra Upper, Bamba Nala) |
| Field Images | 8 geo-coded photos (pre + post intervention) |
| Satellite Source | Landsat 8 OLI Collection 2 Level-2 (30m) |
| DEM Source | SRTM 30m |
| Intervention Period | 2022–2024 |

### Key Demo Numbers

| Metric | Before (2022) | After (2024) | Change |
|---|---|---|---|
| NDVI Mean | 0.19 | 0.39 | **+105.3%** |
| Vegetation Area | 490 ha | 980 ha | **+490 ha** |
| Water Spread | 240 ha | 840 ha | **+600 ha** |
| Bare Land | 980 ha | 580 ha | **−400 ha** |

---

## API Documentation

The FastAPI backend auto-generates interactive Swagger docs at:
**http://localhost:8080/docs**

### Key Endpoints

```
# Authentication
POST /api/auth/login        → JWT token (username: admin@watersight.in / WaterSight2024!)

# Watersheds
GET  /api/watersheds        → GeoJSON boundaries + metadata
GET  /api/watersheds/{id}/stats → Time-series KPI data

# Geo-coded Images
GET  /api/images?watershed_id=... → GeoJSON FeatureCollection (map markers)
POST /api/images/upload           → EXIF auto-extraction + CV classification

# Thematic Layers
GET  /api/layers?watershed_id=... → Layer catalog
GET  /api/layers/{id}/point?lat=&lon= → Sample pixel value at GPS point

# Analytics
GET  /api/analytics/ndvi-trend   → Time-series data for charts
GET  /api/analytics/change-detection → Before/after comparison stats
GET  /api/analytics/summary      → Platform-wide KPI dashboard

# Reports
POST /api/reports/generate       → Trigger async PDF generation
GET  /api/reports/{id}/download  → Stream PDF report
```

---

## SRISHTI-DRISHTI Integration

The platform uses a **source-agnostic adapter pattern** for satellite data:

```python
# Current demo: LandsatAdapter (pre-downloaded open data)
pipeline = WatersightPipeline(adapter_class=LandsatAdapter)

# Future production: One-file swap to ISRO API
pipeline = WatersightPipeline(adapter_class=SRISHTIDRISHTIAdapter)
```

**Only `SRISHTIDRISHTIAdapter` needs to be implemented** (currently a stub in `pipeline/run_pipeline.py`). All architecture, data models, APIs, and frontend code remain unchanged.

---

## Technology Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 18 + Vite | Fast build, HMR, large ecosystem |
| Map | MapLibre GL JS | Open-source Mapbox fork, free tile serving |
| Charts | Recharts | Declarative React charts |
| Backend | FastAPI (Python) | Native GIS stack, async, auto-docs |
| Database | PostgreSQL 15 + PostGIS 3.4 | Industry gold standard for spatial data |
| Storage | MinIO (S3-compatible) | Fully local, zero-cost S3 API |
| Tile Server | TiTiler | COG-native raster tile serving |
| Geoprocessing | rasterio + GDAL + WhiteboxTools | Full open-source RS stack |
| PDF Reports | WeasyPrint + Jinja2 | HTML/CSS → PDF, no headless browser |
| Deployment | Docker Compose | One-command reproducible setup |

**Total paid API dependencies: ZERO**

---

## Geoprocessing Pipeline

Run once before the demo to pre-compute all thematic layers:

```bash
# Full pipeline (NDVI + NDWI + LULC + drainage + demo images)
python pipeline/run_pipeline.py --all --images

# Individual steps
python pipeline/run_pipeline.py --ndvi       # NDVI layers
python pipeline/run_pipeline.py --ndwi       # NDWI/MNDWI layers
python pipeline/run_pipeline.py --lulc       # Land cover classification
python pipeline/run_pipeline.py --drainage   # Drainage network from DEM
python pipeline/run_pipeline.py --images     # Generate demo field photos
```

---

## Replication for Other States/Watersheds

The platform is config-driven. To deploy for a different watershed program:

1. **Edit `pipeline/run_pipeline.py`** — Add your site to `DEMO_SITES` with its bbox and watershed ID
2. **Upload watershed boundary** — GeoJSON or shapefile via admin API
3. **Run pipeline** — `python run_pipeline.py --site your_site --all`
4. **Update seed data** — Edit `db/seed_data.sql` for your actual coordinates and intervention data
5. **Deploy** — `docker-compose up` — same stack, no code changes

---

## Assumptions & Open Questions

| # | Assumption | Impact if Wrong |
|---|---|---|
| 1 | SRISHTI-DRISHTI API is unavailable for demo | Use LandsatAdapter (already done) |
| 2 | No real field photos available | 8 synthetic images generated with realistic EXIF |
| 3 | Image classification = rule-based RGB heuristic | Replace `_classify_image_bytes()` with CNN model |
| 4 | Single demo watershed (Rajsamand) | Extend `DEMO_SITES` dict in pipeline |
| 5 | TiTiler serves COG GeoTIFFs locally | In production, use cloud-hosted COGs on S3/GCS |
| 6 | Demo passwords hardcoded in seed data | Replace with proper bcrypt hashes before production |
