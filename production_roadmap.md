# WaterSight: Post-MVP Production Roadmap

To transition WaterSight from a hackathon MVP to an enterprise-grade, scalable platform for government and institutional use, the following comprehensive engineering roadmap must be executed.

---

## Phase 1: Robust Backend & Data Engineering
*Currently, the MVP relies on a mocked frontend state and pre-calculated JSON datasets. The first step is fully decoupling the client and building a robust geospatial backend.*

*   **1.1 PostGIS Geospatial Database:** Migrate all mock `demoData.js` into a PostgreSQL database with the PostGIS extension. This allows for highly complex spatial queries, such as calculating the exact intersection between uploaded photos and specific micro-watershed boundaries (using `ST_Contains`, `ST_Intersects`).
*   **1.2 Automated ETL Pipelines:** Replace the mock `scrape_bhuvan_yuktdhara.py` script with an Apache Airflow or Prefect orchestrated ETL pipeline. This pipeline will continuously ingest data from Bhuvan WFS/WMS endpoints, handling rate limits, retries, and data normalization automatically.
*   **1.3 Cloud Object Storage:** Transition image storage from the local filesystem (`frontend/public/images`) to an Amazon S3 or Google Cloud Storage bucket. Implement signed URLs for secure, temporary image access on the frontend.

## Phase 2: Live Satellite Integration Pipeline (Earth Observation)
*Currently, NDVI/NDWI layers are static approximations. We need to build a pipeline that automatically fetches and processes live satellite data.*

*   **2.1 SentinelHub / Google Earth Engine (GEE) Integration:** Implement a backend microservice that connects to the Google Earth Engine Python API or SentinelHub. 
*   **2.2 Automated Raster Processing:** When a new AOI (Area of Interest) is registered, the system should automatically pull the latest clear-sky (low cloud cover) Sentinel-2 (10m) or Landsat 8/9 (30m) scenes, compute the NDVI and NDWI rasters on the fly, and store them as Cloud Optimized GeoTIFFs (COGs).
*   **2.3 Dynamic Map Tiling:** Use a lightweight tile server (like TiTiler) to serve these COGs dynamically to the Mapbox/MapLibre frontend without needing pre-rendered PNG overlays.

## Phase 3: Advanced Computer Vision & AI Verification
*Currently, image classification relies on a randomized heuristic. We need a real Machine Learning pipeline to verify ground-truth images.*

*   **3.1 Image Segmentation Model:** Train a lightweight semantic segmentation model (e.g., YOLOv8-seg or DeepLabV3) using a dataset of rural Indian water structures. The model should accurately segment water bodies, vegetation, and bare soil within the field photographs.
*   **3.2 Automated Anomaly Detection:** Implement the "Cross-Check Flag". The backend will compare the CV output of the ground photo (e.g., "90% water detected") with the satellite NDWI value at that exact coordinate. High discrepancies (e.g., ground photo shows a full dam, satellite shows dry land) will be automatically flagged for human review.

## Phase 4: Enterprise Frontend & User Workflows
*Currently, the app is a single dashboard. It needs role-based access and offline capabilities.*

*   **4.1 Progressive Web App (PWA):** Convert the React frontend into a PWA so field workers can use it on mobile devices with poor internet connectivity. They should be able to upload images offline, and the app will sync them (along with EXIF data) when they return to a network.
*   **4.2 Role-Based Access Control (RBAC):** Implement authentication (e.g., AWS Cognito, Auth0) with distinct roles:
    *   **Field Worker:** Can only capture and upload photos.
    *   **District Auditor:** Can view specific districts, review flagged anomalies, and generate reports.
    *   **State Administrator:** Has a macro-level dashboard of all watersheds.

## Phase 5: Infrastructure & Deployment
*Currently, it runs via `docker-compose` locally. It must be deployed for high availability.*

*   **5.1 Kubernetes (EKS/GKE):** Containerize the backend, tile server, and ML worker nodes and deploy them to a managed Kubernetes cluster for automatic scaling during high-load periods (e.g., end-of-financial-year reporting when thousands of photos are uploaded).
*   **5.2 CI/CD Pipelines:** Setup GitHub Actions for automated testing and deployment of frontend and backend services.
*   **5.3 Government Compliance:** Ensure all data storage complies with MeitY (Ministry of Electronics and Information Technology) guidelines for data localization (storing data on Indian servers).
