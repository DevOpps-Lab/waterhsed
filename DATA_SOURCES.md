# Data Sources & Provenance

This document outlines the exact provenance of all datasets used in the WaterSight SIH Demo for the **Rajsamand, Rajasthan** Area of Interest (AOI). Every number, coordinate, and image on screen traces back to these public, verifiable government and scientific data sources.

## 1. Field Photographs & Geo-tags
*   **Source:** Bhuvan GeoMGNREGA / Yuktdhara Portal (ISRO/NRSC)
*   **Portal URL:** [https://bhuvan-app2.nrsc.gov.in/mgnrega/mgnrega_phase2.php](https://bhuvan-app2.nrsc.gov.in/mgnrega/mgnrega_phase2.php)
*   **Methodology:** Manually sourced from public asset viewing for Water Conservation structures (Check Dams, Farm Ponds, Afforestation) in Rajsamand District (District Code: 2722).
*   **Data Used:** Baseline (pre) and completed (post) field photographs with native GPS EXIF telemetry.
*   **Local Path:** `/frontend/public/images/`

## 2. Satellite Imagery (Multispectral)
*   **Source:** USGS EarthExplorer (Landsat 8/9 Collection 2 Level-2)
*   **Portal URL:** [https://earthexplorer.usgs.gov/](https://earthexplorer.usgs.gov/)
*   **Resolution:** 30m / Atmospherically Corrected Surface Reflectance
*   **Scenes Used:**
    *   **Pre-Intervention (2022):** `LC08_L2SP_148043_20220430_20220506_02_T1` (Date: 30-Apr-2022)
    *   **Post-Intervention (2024):** `LC09_L2SP_148043_20240920_20240922_02_T1` (Date: 20-Sep-2024)
*   **Derived Indices:** NDVI (Normalized Difference Vegetation Index) and MNDWI (Modified Normalized Difference Water Index) were computed from NIR, Red, and SWIR bands.

## 3. Watershed Boundary & Drainage (DEM)
*   **Source:** SRTM 30m Global Digital Elevation Model & Bhuvan Watershed Atlas
*   **Boundary:** Micro-watershed boundary approximated visually based on the Department of Land Resources IWMP maps for Rajsamand West.
*   **Drainage:** Stream networks derived from SRTM 30m DEM using WhiteboxTools hydrological routing.

## 4. Land Use / Land Cover (LULC) Reference
*   **Source:** Bhuvan Thematic Services (ISRO)
*   **Usage:** Used as ground-truth cross-reference against our platform's automated heuristic classification.
