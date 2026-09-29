-- =============================================================================
-- WaterSight: SEED DATA
-- Demo: Rajsamand Watershed, Rajasthan
-- Run AFTER schema.sql
-- =============================================================================

-- =============================================================================
-- USERS (Demo accounts)
-- Password hashes are bcrypt of the listed passwords
-- admin: admin@watersight.in / WaterSight2024!
-- field: field@watersight.in / Field@123
-- analyst: analyst@watersight.in / Analyst@123
-- =============================================================================
INSERT INTO users (id, email, full_name, role, password_hash) VALUES
    ('00000000-0000-0000-0000-000000000001', 'admin@watersight.in',   'Dr. Meera Sharma',    'admin',         '$2b$12$PLACEHOLDER_ADMIN_HASH'),
    ('00000000-0000-0000-0000-000000000002', 'field@watersight.in',   'Ramesh Patel',        'field_officer', '$2b$12$PLACEHOLDER_FIELD_HASH'),
    ('00000000-0000-0000-0000-000000000003', 'analyst@watersight.in', 'Priya Venkataraman',  'analyst',       '$2b$12$PLACEHOLDER_ANALYST_HASH');

-- =============================================================================
-- WATERSHED 1: Rajsamand (Primary Demo Watershed)
-- ~2400 ha semi-arid watershed near Rajsamand Lake, Rajasthan
-- Coordinates: ~24.88°N, 73.88°E (Rajsamand district)
-- =============================================================================
INSERT INTO watersheds (
    id, name, local_name, state, district, block, village,
    area_ha, boundary, centroid,
    elevation_min_m, elevation_max_m,
    source_data, program, created_by
) VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Rajsamand Watershed (West)',
    'राजसमंद जलग्रहण क्षेत्र (पश्चिम)',
    'Rajasthan', 'Rajsamand', 'Railmagra', 'Kanthariya',
    2387.5,
    ST_GeomFromText('MULTIPOLYGON(((
        73.840 24.840,
        73.920 24.840,
        73.925 24.900,
        73.920 24.960,
        73.860 24.960,
        73.840 24.920,
        73.835 24.870,
        73.840 24.840
    )))', 4326),
    ST_GeomFromText('POINT(73.880 24.900)', 4326),
    310.0, 580.0,
    'survey_of_india', 'PMKSY-IWMP', '00000000-0000-0000-0000-000000000001'
);

-- =============================================================================
-- WATERSHED 2: Udaipur (Secondary Reference Watershed)
-- =============================================================================
INSERT INTO watersheds (
    id, name, local_name, state, district, block, village,
    area_ha, boundary, centroid,
    elevation_min_m, elevation_max_m,
    source_data, program, created_by
) VALUES (
    '22222222-2222-2222-2222-222222222222',
    'Udaipur North Watershed',
    'उदयपुर उत्तर जलग्रहण',
    'Rajasthan', 'Udaipur', 'Girwa', 'Bujhda',
    1840.0,
    ST_GeomFromText('MULTIPOLYGON(((
        73.680 24.610,
        73.750 24.610,
        73.755 24.660,
        73.750 24.710,
        73.690 24.710,
        73.680 24.670,
        73.675 24.630,
        73.680 24.610
    )))', 4326),
    ST_GeomFromText('POINT(73.715 24.660)', 4326),
    580.0, 920.0,
    'bhuvan', 'MGNREGS', '00000000-0000-0000-0000-000000000001'
);

-- =============================================================================
-- SUB-WATERSHEDS (Rajsamand)
-- 3 micro-watersheds within Rajsamand Watershed
-- =============================================================================
INSERT INTO sub_watersheds (id, watershed_id, name, code, area_ha, boundary, centroid) VALUES
(
    'aaaa0001-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'Kanthariya Nala Sub-watershed',
    'WRJ-01-A',
    830.0,
    ST_GeomFromText('POLYGON((
        73.840 24.840, 73.880 24.840,
        73.885 24.880, 73.880 24.920,
        73.840 24.920, 73.835 24.870,
        73.840 24.840
    ))', 4326),
    ST_GeomFromText('POINT(73.862 24.880)', 4326)
),
(
    'aaaa0002-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'Railmagra Upper Sub-watershed',
    'WRJ-01-B',
    920.0,
    ST_GeomFromText('POLYGON((
        73.880 24.840, 73.920 24.840,
        73.925 24.900, 73.900 24.920,
        73.880 24.920, 73.885 24.880,
        73.880 24.840
    ))', 4326),
    ST_GeomFromText('POINT(73.903 24.880)', 4326)
),
(
    'aaaa0003-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    'Bamba Nala Sub-watershed',
    'WRJ-01-C',
    637.5,
    ST_GeomFromText('POLYGON((
        73.840 24.920, 73.900 24.920,
        73.920 24.960, 73.860 24.960,
        73.840 24.940, 73.840 24.920
    ))', 4326),
    ST_GeomFromText('POINT(73.880 24.940)', 4326)
);

-- =============================================================================
-- GEO-CODED IMAGES (8 synthetic field photos for demo)
-- Pre-intervention (2022) and Post-intervention (2024) photos
-- =============================================================================
INSERT INTO geo_images (
    id, watershed_id, sub_watershed_id,
    location, altitude_m, bearing_deg,
    captured_at,
    file_path, thumbnail_path,
    intervention_type, observation_stage,
    classification_label, classification_confidence, classification_tags,
    ndvi_at_point, ndwi_at_point, lulc_class_at_point, slope_at_point,
    notes, has_valid_gps, uploaded_by,
    exif_raw
) VALUES

-- Image 1: Check dam (pre-intervention, 2022)
(
    'img00001-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'aaaa0001-0000-0000-0000-000000000001',
    ST_GeomFromText('POINT(73.857 24.862)', 4326), 385.0, 210.0,
    '2022-05-15 10:30:00+05:30',
    'images/rajsamand/2022_pre/check_dam_01_pre.jpg',
    'thumbnails/rajsamand/2022_pre/check_dam_01_pre_thumb.jpg',
    'check_dam', 'pre',
    'bare_degraded_land', 0.87, ARRAY['dry_nala', 'rocky_soil', 'no_structure'],
    0.08, -0.42, 'Barren/Rocky', 12.5,
    'Dry nala bed — planned location for check dam. Severe soil erosion visible. No vegetation cover.',
    TRUE, '00000000-0000-0000-0000-000000000002',
    '{"Make": "Samsung", "Model": "Galaxy A52", "GPS": {"Latitude": 24.862, "Longitude": 73.857, "Altitude": 385.0}, "DateTime": "2022:05:15 10:30:00"}'
),

-- Image 2: Check dam (post-intervention, 2024)
(
    'img00002-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'aaaa0001-0000-0000-0000-000000000001',
    ST_GeomFromText('POINT(73.858 24.863)', 4326), 384.0, 215.0,
    '2024-09-20 11:15:00+05:30',
    'images/rajsamand/2024_post/check_dam_01_post.jpg',
    'thumbnails/rajsamand/2024_post/check_dam_01_post_thumb.jpg',
    'check_dam', 'post',
    'structure_intact', 0.93, ARRAY['check_dam_built', 'water_impounded', 'vegetation_recovery'],
    0.51, 0.18, 'Water/Wetland', 12.3,
    'Check dam successfully constructed. Water impounded behind structure. Vegetation regenerating on upstream banks.',
    TRUE, '00000000-0000-0000-0000-000000000002',
    '{"Make": "Samsung", "Model": "Galaxy A52", "GPS": {"Latitude": 24.863, "Longitude": 73.858, "Altitude": 384.0}, "DateTime": "2024:09:20 11:15:00"}'
),

-- Image 3: Farm pond (pre-intervention, 2022)
(
    'img00003-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    'aaaa0002-0000-0000-0000-000000000002',
    ST_GeomFromText('POINT(73.901 24.872)', 4326), 402.0, 45.0,
    '2022-06-02 08:45:00+05:30',
    'images/rajsamand/2022_pre/farm_pond_01_pre.jpg',
    'thumbnails/rajsamand/2022_pre/farm_pond_01_pre_thumb.jpg',
    'farm_pond', 'pre',
    'bare_degraded_land', 0.79, ARRAY['dry_land', 'cracked_soil'],
    0.12, -0.38, 'Agricultural (Dry)', 3.2,
    'Agricultural field — severely dry. Proposed farm pond site. Cracked clay soil visible.',
    TRUE, '00000000-0000-0000-0000-000000000002',
    '{"Make": "Xiaomi", "Model": "Redmi Note 10", "GPS": {"Latitude": 24.872, "Longitude": 73.901, "Altitude": 402.0}, "DateTime": "2022:06:02 08:45:00"}'
),

-- Image 4: Farm pond (post-intervention, 2024)
(
    'img00004-0000-0000-0000-000000000004',
    '11111111-1111-1111-1111-111111111111',
    'aaaa0002-0000-0000-0000-000000000002',
    ST_GeomFromText('POINT(73.902 24.873)', 4326), 401.0, 48.0,
    '2024-08-30 09:00:00+05:30',
    'images/rajsamand/2024_post/farm_pond_01_post.jpg',
    'thumbnails/rajsamand/2024_post/farm_pond_01_post_thumb.jpg',
    'farm_pond', 'post',
    'water_body_present', 0.96, ARRAY['water_full', 'green_buffer', 'crop_nearby'],
    0.38, 0.45, 'Water/Wetland', 3.1,
    'Farm pond filled after monsoon. 0.3 ha water spread. Green buffer vegetation along bund. Nearby kharif crop looking healthy.',
    TRUE, '00000000-0000-0000-0000-000000000002',
    '{"Make": "Xiaomi", "Model": "Redmi Note 10", "GPS": {"Latitude": 24.873, "Longitude": 73.902, "Altitude": 401.0}, "DateTime": "2024:08:30 09:00:00"}'
),

-- Image 5: Afforestation site (pre, 2022)
(
    'img00005-0000-0000-0000-000000000005',
    '11111111-1111-1111-1111-111111111111',
    'aaaa0003-0000-0000-0000-000000000003',
    ST_GeomFromText('POINT(73.868 24.935)', 4326), 445.0, 90.0,
    '2022-05-28 14:20:00+05:30',
    'images/rajsamand/2022_pre/afforestation_01_pre.jpg',
    'thumbnails/rajsamand/2022_pre/afforestation_01_pre_thumb.jpg',
    'afforestation', 'pre',
    'bare_degraded_land', 0.91, ARRAY['scrub_land', 'no_trees', 'erosion_rills'],
    0.06, -0.51, 'Scrubland/Degraded', 18.7,
    'Degraded hillslope. Sparse Prosopis shrubs. Severe sheet erosion visible. Proposed afforestation area.',
    TRUE, '00000000-0000-0000-0000-000000000002',
    '{"Make": "Oppo", "Model": "A74", "GPS": {"Latitude": 24.935, "Longitude": 73.868, "Altitude": 445.0}, "DateTime": "2022:05:28 14:20:00"}'
),

-- Image 6: Afforestation site (post, 2024)
(
    'img00006-0000-0000-0000-000000000006',
    '11111111-1111-1111-1111-111111111111',
    'aaaa0003-0000-0000-0000-000000000003',
    ST_GeomFromText('POINT(73.868 24.936)', 4326), 444.0, 92.0,
    '2024-09-05 14:50:00+05:30',
    'images/rajsamand/2024_post/afforestation_01_post.jpg',
    'thumbnails/rajsamand/2024_post/afforestation_01_post_thumb.jpg',
    'afforestation', 'post',
    'dense_vegetation', 0.88, ARRAY['young_trees', 'ground_cover', 'erosion_controlled'],
    0.62, -0.08, 'Vegetation/Forest', 18.5,
    'Afforestation successful. Young neem and khejri trees 2-3m height. Ground cover established. Erosion rills healed.',
    TRUE, '00000000-0000-0000-0000-000000000002',
    '{"Make": "Oppo", "Model": "A74", "GPS": {"Latitude": 24.936, "Longitude": 73.868, "Altitude": 444.0}, "DateTime": "2024:09:05 14:50:00"}'
),

-- Image 7: Contour trench (post, 2024)
(
    'img00007-0000-0000-0000-000000000007',
    '11111111-1111-1111-1111-111111111111',
    'aaaa0001-0000-0000-0000-000000000001',
    ST_GeomFromText('POINT(73.851 24.875)', 4326), 420.0, 180.0,
    '2024-09-12 10:00:00+05:30',
    'images/rajsamand/2024_post/contour_trench_01.jpg',
    'thumbnails/rajsamand/2024_post/contour_trench_01_thumb.jpg',
    'contour_trench', 'post',
    'structure_intact', 0.84, ARRAY['trenches_visible', 'moisture_retained'],
    0.34, -0.12, 'Agricultural', 15.2,
    'Contour trenches along hillslope. Water harvesting visible. Soil moisture retained post-monsoon.',
    TRUE, '00000000-0000-0000-0000-000000000002',
    '{"Make": "Samsung", "Model": "Galaxy A52", "GPS": {"Latitude": 24.875, "Longitude": 73.851, "Altitude": 420.0}, "DateTime": "2024:09:12 10:00:00"}'
),

-- Image 8: Gully plug (post, 2024)
(
    'img00008-0000-0000-0000-000000000008',
    '11111111-1111-1111-1111-111111111111',
    'aaaa0002-0000-0000-0000-000000000002',
    ST_GeomFromText('POINT(73.912 24.888)', 4326), 390.0, 270.0,
    '2024-09-18 12:30:00+05:30',
    'images/rajsamand/2024_post/gully_plug_01.jpg',
    'thumbnails/rajsamand/2024_post/gully_plug_01_thumb.jpg',
    'gully_plug', 'post',
    'structure_intact', 0.79, ARRAY['boulder_structure', 'sediment_trapped'],
    0.28, -0.05, 'Agricultural', 8.3,
    'Stone gully plug installed. Sediment deposition visible. Gully head erosion arrested.',
    TRUE, '00000000-0000-0000-0000-000000000002',
    '{"Make": "Xiaomi", "Model": "Redmi Note 10", "GPS": {"Latitude": 24.888, "Longitude": 73.912, "Altitude": 390.0}, "DateTime": "2024:09:18 12:30:00"}'
);

-- =============================================================================
-- THEMATIC LAYERS (metadata for pre-computed GeoTIFFs)
-- =============================================================================
INSERT INTO thematic_layers (
    id, watershed_id, layer_type, period_label, period_slug,
    date_start, date_end, satellite_source,
    file_path, tile_url_template,
    bbox, pixel_size_m,
    stats, colormap, adapter_class, processing_notes
) VALUES

-- NDVI Pre-monsoon 2022
(
    'layer001-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'ndvi', 'Pre-Monsoon 2022', '2022-pre',
    '2022-04-01', '2022-05-31', 'Landsat8_C2L2',
    'layers/rajsamand/ndvi_2022_pre.tif',
    'http://localhost:8000/cog/tiles/{z}/{x}/{y}.png?url=layers/rajsamand/ndvi_2022_pre.tif&colormap_name=rdylgn&rescale=-0.2,0.8',
    ST_GeomFromText('POLYGON((73.835 24.840, 73.925 24.840, 73.925 24.960, 73.835 24.960, 73.835 24.840))', 4326),
    30.0,
    '{"min": -0.21, "max": 0.68, "mean": 0.19, "std": 0.18, "p5": -0.10, "p95": 0.52}',
    'RdYlGn', 'LandsatAdapter',
    'Landsat 8 OLI Collection 2 Level-2. Scene LC08_148043_20220430. NDVI = (NIR-Red)/(NIR+Red). Bands 5 and 4.'
),

-- NDVI Post-monsoon 2024
(
    'layer002-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'ndvi', 'Post-Monsoon 2024', '2024-post',
    '2024-09-01', '2024-10-31', 'Landsat8_C2L2',
    'layers/rajsamand/ndvi_2024_post.tif',
    'http://localhost:8000/cog/tiles/{z}/{x}/{y}.png?url=layers/rajsamand/ndvi_2024_post.tif&colormap_name=rdylgn&rescale=-0.2,0.8',
    ST_GeomFromText('POLYGON((73.835 24.840, 73.925 24.840, 73.925 24.960, 73.835 24.960, 73.835 24.840))', 4326),
    30.0,
    '{"min": -0.12, "max": 0.81, "mean": 0.39, "std": 0.22, "p5": -0.05, "p95": 0.74}',
    'RdYlGn', 'LandsatAdapter',
    'Landsat 8 OLI Collection 2 Level-2. Scene LC08_148043_20240920. NDVI post-monsoon peak vegetation.'
),

-- NDWI Pre-monsoon 2022
(
    'layer003-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    'mndwi', 'Pre-Monsoon 2022', '2022-pre',
    '2022-04-01', '2022-05-31', 'Landsat8_C2L2',
    'layers/rajsamand/ndwi_2022_pre.tif',
    'http://localhost:8000/cog/tiles/{z}/{x}/{y}.png?url=layers/rajsamand/ndwi_2022_pre.tif&colormap_name=blues&rescale=-0.5,0.5',
    ST_GeomFromText('POLYGON((73.835 24.840, 73.925 24.840, 73.925 24.960, 73.835 24.960, 73.835 24.840))', 4326),
    30.0,
    '{"min": -0.58, "max": 0.42, "mean": -0.28, "std": 0.18}',
    'Blues', 'LandsatAdapter',
    'MNDWI = (Green - SWIR1)/(Green + SWIR1). Bands 3 and 6. Pre-monsoon dry season.'
),

-- NDWI Post-monsoon 2024
(
    'layer004-0000-0000-0000-000000000004',
    '11111111-1111-1111-1111-111111111111',
    'mndwi', 'Post-Monsoon 2024', '2024-post',
    '2024-09-01', '2024-10-31', 'Landsat8_C2L2',
    'layers/rajsamand/ndwi_2024_post.tif',
    'http://localhost:8000/cog/tiles/{z}/{x}/{y}.png?url=layers/rajsamand/ndwi_2024_post.tif&colormap_name=blues&rescale=-0.5,0.5',
    ST_GeomFromText('POLYGON((73.835 24.840, 73.925 24.840, 73.925 24.960, 73.835 24.960, 73.835 24.840))', 4326),
    30.0,
    '{"min": -0.41, "max": 0.68, "mean": -0.08, "std": 0.22}',
    'Blues', 'LandsatAdapter',
    'Post-monsoon. Water spread significantly increased. Rajsamand lake and check dams clearly visible.'
),

-- LULC 2024
(
    'layer005-0000-0000-0000-000000000005',
    '11111111-1111-1111-1111-111111111111',
    'lulc', 'Land Use Land Cover 2024', '2024-post',
    '2024-01-01', '2024-12-31', 'Landsat8_C2L2_RF',
    'layers/rajsamand/lulc_2024.tif',
    'http://localhost:8000/cog/tiles/{z}/{x}/{y}.png?url=layers/rajsamand/lulc_2024.tif&colormap={"1":[34,139,34],"2":[173,216,130],"3":[210,180,140],"4":[0,119,190],"5":[192,192,192]}',
    ST_GeomFromText('POLYGON((73.835 24.840, 73.925 24.840, 73.925 24.960, 73.835 24.960, 73.835 24.840))', 4326),
    30.0,
    '{"classes": {"1": "Dense Vegetation", "2": "Agriculture/Grassland", "3": "Barren/Rocky", "4": "Water Body", "5": "Built-up"}, "class_areas_ha": {"1": 487, "2": 840, "3": 620, "4": 312, "5": 128}}',
    'custom', 'LandsatAdapter',
    '5-class Random Forest classification. Training samples from Google Earth visual interpretation. OA=87%, Kappa=0.83.'
),

-- Drainage Network
(
    'layer006-0000-0000-0000-000000000006',
    '11111111-1111-1111-1111-111111111111',
    'drainage', 'Drainage Network (SRTM)', 'static',
    '2000-02-11', '2000-02-22', 'SRTM_30m',
    'layers/rajsamand/drainage_network.geojson',
    NULL,
    ST_GeomFromText('POLYGON((73.835 24.840, 73.925 24.840, 73.925 24.960, 73.835 24.960, 73.835 24.840))', 4326),
    30.0,
    '{"stream_order_max": 4, "total_length_km": 48.3, "num_segments": 124}',
    'Blues', 'DEMAdapter',
    'Derived from SRTM 30m DEM using WhiteboxTools D8 flow direction and Strahler stream ordering. Threshold: 500 cells.'
);

-- =============================================================================
-- WATERSHED STATS (Time-series KPI data for trend charts)
-- Pre-computed from thematic layers — this is what the dashboard shows
-- =============================================================================
INSERT INTO watershed_stats (
    watershed_id, sub_watershed_id, recorded_date, period_label,
    ndvi_mean, ndvi_min, ndvi_max,
    vegetation_ha, dense_veg_ha,
    ndwi_mean, water_spread_ha, moisture_ha,
    bare_land_ha, agricultural_ha,
    image_count, image_pre_count, image_post_count,
    source_layer_id
) VALUES

-- Rajsamand whole watershed — 2021 pre
('11111111-1111-1111-1111-111111111111', NULL, '2021-04-30', 'Pre-Monsoon 2021',
 0.15, -0.18, 0.61, 410, 120, -0.31, 210, 380, 1050, 580, 0, 0, 0, NULL),

-- Rajsamand — 2022 pre
('11111111-1111-1111-1111-111111111111', NULL, '2022-04-30', 'Pre-Monsoon 2022',
 0.19, -0.21, 0.68, 490, 148, -0.28, 240, 420, 980, 620, 2, 2, 0, 'layer001-0000-0000-0000-000000000001'),

-- Rajsamand — 2022 post (monsoon)
('11111111-1111-1111-1111-111111111111', NULL, '2022-10-15', 'Post-Monsoon 2022',
 0.29, -0.10, 0.74, 720, 260, 0.02, 480, 580, 740, 810, 0, 0, 0, NULL),

-- Rajsamand — 2023 pre
('11111111-1111-1111-1111-111111111111', NULL, '2023-04-30', 'Pre-Monsoon 2023',
 0.22, -0.18, 0.71, 560, 185, -0.24, 280, 450, 880, 680, 0, 0, 0, NULL),

-- Rajsamand — 2023 post (monsoon)
('11111111-1111-1111-1111-111111111111', NULL, '2023-10-20', 'Post-Monsoon 2023',
 0.33, -0.08, 0.78, 820, 340, 0.08, 560, 650, 680, 840, 0, 0, 0, NULL),

-- Rajsamand — 2024 post (latest — intervention impact visible)
('11111111-1111-1111-1111-111111111111', NULL, '2024-09-20', 'Post-Monsoon 2024',
 0.39, -0.12, 0.81, 980, 487, 0.12, 840, 720, 580, 840, 6, 0, 6, 'layer002-0000-0000-0000-000000000002'),

-- Sub-watershed A — Kanthariya Nala stats
('11111111-1111-1111-1111-111111111111', 'aaaa0001-0000-0000-0000-000000000001', '2022-04-30', 'Pre-Monsoon 2022',
 0.08, -0.20, 0.52, 58, 12, -0.42, 14, 45, 580, 180, 2, 2, 0, NULL),

('11111111-1111-1111-1111-111111111111', 'aaaa0001-0000-0000-0000-000000000001', '2024-09-20', 'Post-Monsoon 2024',
 0.45, -0.05, 0.78, 285, 142, 0.18, 148, 195, 312, 240, 2, 0, 2, NULL),

-- Sub-watershed B — Railmagra Upper stats
('11111111-1111-1111-1111-111111111111', 'aaaa0002-0000-0000-0000-000000000002', '2022-04-30', 'Pre-Monsoon 2022',
 0.12, -0.18, 0.61, 95, 28, -0.38, 18, 68, 450, 340, 1, 1, 0, NULL),

('11111111-1111-1111-1111-111111111111', 'aaaa0002-0000-0000-0000-000000000002', '2024-09-20', 'Post-Monsoon 2024',
 0.38, -0.08, 0.82, 380, 196, 0.08, 310, 245, 210, 380, 2, 0, 2, NULL);

-- =============================================================================
-- SAMPLE REPORT RECORD
-- =============================================================================
INSERT INTO reports (
    id, watershed_id, title, generated_by, generated_at,
    period_start, period_end, file_path, status,
    summary_stats
) VALUES (
    'rep00001-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'Rajsamand Watershed Intervention Impact Assessment Report (2022–2024)',
    '00000000-0000-0000-0000-000000000003',
    '2024-10-01 09:00:00+05:30',
    '2022-01-01', '2024-10-01',
    'reports/rajsamand_impact_2022_2024.pdf',
    'ready',
    '{
        "ndvi_change_pct": 105.3,
        "ndvi_pre": 0.19,
        "ndvi_post": 0.39,
        "vegetation_ha_pre": 490,
        "vegetation_ha_post": 980,
        "vegetation_ha_change": 490,
        "water_spread_ha_pre": 240,
        "water_spread_ha_post": 840,
        "water_spread_ha_change": 600,
        "structures_documented": 5,
        "images_ingested": 8,
        "area_restored_ha": 720,
        "key_interventions": ["check_dam", "farm_pond", "afforestation", "contour_trench", "gully_plug"]
    }'
);

-- =============================================================================
-- AUDIT LOG ENTRIES (sample)
-- =============================================================================
INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, metadata) VALUES
('00000000-0000-0000-0000-000000000002', 'IMAGE_UPLOAD', 'geo_image', 'img00001-0000-0000-0000-000000000001', '192.168.1.105', '{"filename": "check_dam_01_pre.jpg", "size_mb": 3.2}'),
('00000000-0000-0000-0000-000000000002', 'IMAGE_UPLOAD', 'geo_image', 'img00002-0000-0000-0000-000000000002', '192.168.1.105', '{"filename": "check_dam_01_post.jpg", "size_mb": 2.8}'),
('00000000-0000-0000-0000-000000000003', 'REPORT_GENERATE', 'report', 'rep00001-0000-0000-0000-000000000001', '192.168.1.108', '{"watershed_id": "11111111-1111-1111-1111-111111111111", "period": "2022-2024"}'),
('00000000-0000-0000-0000-000000000001', 'LAYER_UPLOAD', 'thematic_layer', 'layer002-0000-0000-0000-000000000002', '192.168.1.100', '{"filename": "ndvi_2024_post.tif", "size_mb": 12.4}');
