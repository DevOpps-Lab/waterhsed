# WaterSight — Production Build Prompt Pack

This document contains a system-context prompt plus three sequential build prompts for taking WaterSight from hackathon MVP to a production, enterprise-grade platform. Paste **Prompt 0** once at the start of a coding-agent session (Claude Code, Cursor, etc.), then run **Prompt 1 → 2 → 3** in order, only advancing once the previous phase is working and tested locally.

Do not paste all four at once — sequencing forces the agent to build a working slice before adding complexity, instead of producing a large, disconnected scaffold.

---

## Prompt 0 — Project Context (paste once, at the start)

```
You are helping me build WaterSight, a platform for verifying rural water
conservation structures (check dams, ponds, percolation tanks) by
cross-referencing ground-truth field photos against satellite imagery.

CURRENT STATE (hackathon MVP):
- Frontend-only state management, no real backend
- Mock data in frontend/demoData.js
- A stub scraper script, scrape_bhuvan_yuktdhara.py, that does not hit
  real Bhuvan WFS/WMS endpoints
- NDVI/NDWI map layers are static, pre-rendered approximations, not live
- Image "classification" is a randomized heuristic, not a real model
- Photos are stored on the local filesystem (frontend/public/images)

TARGET ARCHITECTURE (three phases, build in order):

Phase 1 — Backend & Data Engineering
  - PostgreSQL + PostGIS for all spatial data (watersheds, AOIs, reports)
  - FastAPI backend with SQLAlchemy + GeoAlchemy2, Alembic migrations
  - Prefect-orchestrated ETL replacing the mock Bhuvan scraper, with
    retries, backoff, and data normalization
  - S3 (or GCS) object storage for photos, accessed via presigned URLs
    (client uploads directly to storage, never proxied through the API)

Phase 2 — Live Satellite Integration
  - Google Earth Engine (GEE) Python API to pull the latest low-cloud
    Sentinel-2 scene per AOI and compute NDVI/NDWI bands
  - Convert exports to Cloud-Optimized GeoTIFFs (COGs) via rio-cogeo
  - Serve COGs dynamically through TiTiler rather than pre-rendered PNGs
  - Automatic refresh: on AOI creation, and nightly for existing AOIs

Phase 3 — CV Verification
  - YOLOv8-seg model (fine-tuned from a pretrained checkpoint) to segment
    water / vegetation / bare soil in field photos
  - Cross-check flag: compare the CV water-percentage estimate against
    the satellite NDWI value sampled at the AOI's exact coordinate;
    flag high discrepancies for human review

GROUND RULES FOR THIS SESSION:
1. Work phase by phase. Do not start Phase 2 code until Phase 1 is
   working and I've confirmed it. Same for Phase 3.
2. After each phase, show me: the schema/migration changes, the new
   API endpoints, and exact steps to test it locally (e.g. docker
   compose commands, curl examples) before we move on.
3. Ask me before making decisions I haven't specified — hosting
   provider, exact model checkpoint size, auth strategy, etc. Don't
   silently pick defaults for anything architecturally significant.
4. Prefer boring, well-documented tools over novel ones. This is a
   government/institutional-facing platform — favor reliability and
   auditability over cleverness.
5. Every new service should be independently testable (unit tests for
   business logic, at least one integration test per endpoint).
```

---

## Prompt 1 — Phase 1: Backend & Data Engineering

Run this only after Prompt 0 context is set.

```
Build Phase 1 of WaterSight: the backend and data engineering foundation.

1. Docker Compose setup with a Postgres 15+ service running the PostGIS
   3.4 extension, plus the FastAPI app as a second service.

2. SQLAlchemy models (using GeoAlchemy2 for geometry/geography columns)
   and an Alembic migration for this schema:

   - watersheds: id (uuid pk), name, code (unique), boundary
     (GEOGRAPHY(POLYGON, 4326)), source (default 'bhuvan_yuktdhara')
   - aois: id (uuid pk), name, location (GEOGRAPHY(POINT, 4326)),
     watershed_id (fk -> watersheds), structure_type, created_at
   - field_reports: id (uuid pk), aoi_id (fk -> aois), photo_s3_key,
     captured_at, cv_water_pct (float, nullable), ndwi_value (float,
     nullable), cross_check_flag (bool, default false), status
     (default 'pending_review')
   - satellite_rasters: id (uuid pk), aoi_id (fk -> aois), scene_date,
     cog_s3_key, cloud_cover, index_type ('ndvi' | 'ndwi')

   Add a GiST index on watersheds.boundary and on aois.location.

3. FastAPI endpoints:
   - GET /watersheds and GET /watersheds/{id}
   - GET /aois (support a bbox query param for map-viewport filtering
     using ST_Intersects)
   - GET /aois/{id}
   - GET /aois/{id}/reports
   - POST /field_reports — accepts aoi_id + captured_at, returns a
     presigned S3 PUT URL and the field_report id; the client uploads
     the photo binary directly to S3, not through this API
   - PATCH /field_reports/{id}/confirm-upload — call after the S3
     upload succeeds, to mark the report ready for downstream
     processing

4. A one-off migration script that reads the existing
   frontend/demoData.js and inserts equivalent rows into watersheds
   and aois, so the frontend has real data to point at immediately.

5. Rewrite scrape_bhuvan_yuktdhara.py as a Prefect 2.x flow that:
   - Hits the real Bhuvan WFS/WMS endpoints (or a documented mock if
     credentials aren't available yet — flag this clearly)
   - Retries with exponential backoff on failure
   - Normalizes incoming geometries to EPSG:4326 before writing to
     watersheds
   - Can be run manually and is schedulable via Prefect deployments

Give me the folder structure first, then generate the code file by
file. After the code, give me exact commands to bring the stack up
locally and verify each endpoint with curl, and confirm before we
proceed to Phase 2.
```

---

## Prompt 2 — Phase 2: Live Satellite Integration

Run this only after Phase 1 is confirmed working.

```
Phase 1 is working and confirmed. Now build Phase 2: live satellite
integration.

1. A GEE-backed module that, given an AOI's geometry (from the aois
   table), queries the COPERNICUS/S2_SR_HARMONIZED collection for the
   most recent scene in the last 30 days under 20% cloud cover, and
   computes NDVI (B8, B4) and NDWI (B3, B8) bands.

2. Export the resulting bands as GeoTIFF via
   ee.batch.Export.image.toCloudStorage (or an equivalent path if
   we're on S3 instead of GCS — ask me which bucket/provider to target
   if it's not already clear from Phase 1's storage config).

3. Convert the exported GeoTIFF to a Cloud-Optimized GeoTIFF using
   rio-cogeo, upload it to the same bucket used for photos, and insert
   a row into satellite_rasters (scene_date, cog_s3_key, cloud_cover,
   index_type).

4. Wire this as a Prefect flow triggered:
   - Automatically when a new AOI is created (hook into the
     POST /aois endpoint, or add one if it doesn't exist yet)
   - On a nightly schedule for all existing AOIs

5. Deploy TiTiler (as a sidecar service in docker-compose for local
   dev) pointed at the storage bucket, and give me the exact tile URL
   template the frontend should use to request tiles for a given
   satellite_rasters row, including how to pass a colormap for
   NDVI/NDWI visualization.

Show me how to test this end-to-end locally: register a test AOI,
trigger the flow, confirm a COG lands in storage, and confirm TiTiler
serves valid tiles for it. Confirm with me before we proceed to
Phase 3.
```

---

## Prompt 3 — Phase 3: CV Verification & Cross-Check

Run this only after Phase 2 is confirmed working.

```
Phase 2 is working and confirmed. Now build Phase 3: CV verification.

1. A standalone FastAPI microservice (separate from the main backend,
   since it has different resource/scaling needs) that:
   - Loads a YOLOv8-seg model exported to ONNX
   - Accepts a field photo (via S3 key or direct upload) and returns
     segmentation percentages for water / vegetation / bare soil

2. A training script skeleton for fine-tuning yolov8n-seg.pt on a
   labeled dataset (I will supply annotated images later — assume a
   CVAT or Roboflow export format for now). Include the expected
   dataset YAML structure.

3. A cross-check job that runs when a field_report's upload is
   confirmed:
   - Calls the CV microservice to get cv_water_pct
   - Finds the AOI's most recent satellite_rasters row of type 'ndwi'
   - Samples the NDWI raster at the AOI's exact point using
     rasterio.sample.sample_gen (not a scene-wide average)
   - Applies the cross-check rule: satellite says water if NDWI > 0.3,
     ground says water if cv_water_pct > 50; flag cross_check_flag =
     true if these disagree
   - Writes cv_water_pct, ndwi_value, and cross_check_flag back to the
     field_reports row

4. A review-queue endpoint: GET /field_reports?flagged=true, returning
   flagged reports with their photo URL, cv_water_pct, and ndwi_value
   so a human reviewer can adjudicate.

Show me how to test this end-to-end with a sample photo and a mocked
NDWI value, and how the review-queue endpoint output looks. Flag
anywhere that real accuracy will depend on the quality of the labeled
training dataset, since no amount of code can substitute for that.
```
