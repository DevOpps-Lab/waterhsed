-- =============================================================================
-- WaterSight: Geospatial Watershed Monitoring Platform
-- PostgreSQL + PostGIS Schema
-- Version: 1.0 (SIH Demo MVP)
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE user_role AS ENUM ('admin', 'field_officer', 'analyst', 'public');

CREATE TYPE intervention_type AS ENUM (
    'check_dam',
    'farm_pond',
    'contour_trench',
    'afforestation',
    'gully_plug',
    'soil_bunding',
    'percolation_tank',
    'nala_bunding',
    'other'
);

CREATE TYPE observation_stage AS ENUM ('pre', 'during', 'post');

CREATE TYPE layer_type AS ENUM (
    'ndvi',
    'ndwi',
    'mndwi',
    'lulc',
    'drainage',
    'slope',
    'aspect',
    'change_detection',
    'water_spread'
);

CREATE TYPE image_classification AS ENUM (
    'water_body_present',
    'dense_vegetation',
    'sparse_vegetation',
    'bare_degraded_land',
    'structure_intact',
    'structure_damaged',
    'soil_erosion_visible',
    'mixed',
    'unclassified'
);

-- =============================================================================
-- TABLE: users
-- =============================================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    role            user_role NOT NULL DEFAULT 'analyst',
    password_hash   VARCHAR(255) NOT NULL,
    -- Restrict field_officers to specific watersheds (NULL = all watersheds)
    assigned_watershed_ids UUID[] DEFAULT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE users IS 'Platform users with role-based access control';
COMMENT ON COLUMN users.assigned_watershed_ids IS 'NULL means access to all watersheds (admin/analyst). Array of watershed IDs for field officers.';

-- =============================================================================
-- TABLE: watersheds
-- =============================================================================
CREATE TABLE watersheds (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    local_name      VARCHAR(255),                          -- Name in local language (Hindi/regional)
    state           VARCHAR(100) NOT NULL,
    district        VARCHAR(100) NOT NULL,
    block           VARCHAR(100),
    village         VARCHAR(100),
    area_ha         FLOAT,                                 -- Total area in hectares
    boundary        GEOMETRY(MULTIPOLYGON, 4326) NOT NULL, -- PostGIS spatial column
    centroid        GEOMETRY(POINT, 4326),                 -- Auto-derived centroid for map zoom
    elevation_min_m FLOAT,
    elevation_max_m FLOAT,
    source_data     VARCHAR(100) DEFAULT 'manual',         -- e.g. 'bhuvan', 'survey_of_india', 'manual'
    program         VARCHAR(255),                          -- e.g. 'MGNREGS', 'PMKSY', 'IWMP'
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_watersheds_boundary ON watersheds USING GIST (boundary);
CREATE INDEX idx_watersheds_centroid ON watersheds USING GIST (centroid);
CREATE INDEX idx_watersheds_state ON watersheds (state);

COMMENT ON TABLE watersheds IS 'Top-level watershed administrative unit with PostGIS boundary';

-- =============================================================================
-- TABLE: sub_watersheds
-- =============================================================================
CREATE TABLE sub_watersheds (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    watershed_id    UUID NOT NULL REFERENCES watersheds(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    code            VARCHAR(50),                           -- e.g. WRJ-01-A (standardized code)
    area_ha         FLOAT,
    boundary        GEOMETRY(POLYGON, 4326),
    centroid        GEOMETRY(POINT, 4326),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sub_watersheds_watershed ON sub_watersheds (watershed_id);
CREATE INDEX idx_sub_watersheds_boundary ON sub_watersheds USING GIST (boundary);

-- =============================================================================
-- TABLE: geo_images
-- Central table linking field photos to their spatial context
-- =============================================================================
CREATE TABLE geo_images (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    watershed_id                UUID NOT NULL REFERENCES watersheds(id) ON DELETE CASCADE,
    sub_watershed_id            UUID REFERENCES sub_watersheds(id) ON DELETE SET NULL,

    -- Spatial fields
    location                    GEOMETRY(POINT, 4326) NOT NULL, -- GPS coordinate
    altitude_m                  FLOAT,                           -- GPS altitude from EXIF
    bearing_deg                 FLOAT,                           -- Camera direction (0–360°)
    gps_accuracy_m              FLOAT,                           -- GPS accuracy if available

    -- Temporal fields
    captured_at                 TIMESTAMPTZ,                     -- From EXIF DateTimeOriginal
    uploaded_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uploaded_by                 UUID REFERENCES users(id),

    -- Storage references
    file_path                   VARCHAR(500) NOT NULL,           -- MinIO object key (original)
    thumbnail_path              VARCHAR(500),                    -- MinIO object key (thumbnail)
    file_size_bytes             BIGINT,
    mime_type                   VARCHAR(50) DEFAULT 'image/jpeg',

    -- Field metadata
    intervention_type           intervention_type NOT NULL DEFAULT 'other',
    observation_stage           observation_stage NOT NULL DEFAULT 'post',
    notes                       TEXT,

    -- Auto-classification (CV pipeline output)
    classification_label        image_classification DEFAULT 'unclassified',
    classification_confidence   FLOAT CHECK (classification_confidence BETWEEN 0 AND 1),
    classification_tags         TEXT[],                          -- Additional tags array

    -- Satellite values at this point+date (populated by geoprocessing pipeline)
    ndvi_at_point               FLOAT CHECK (ndvi_at_point BETWEEN -1 AND 1),
    ndwi_at_point               FLOAT CHECK (ndwi_at_point BETWEEN -1 AND 1),
    lulc_class_at_point         VARCHAR(100),
    slope_at_point              FLOAT,                           -- degrees

    -- Raw EXIF data preserved for audit
    exif_raw                    JSONB,

    -- Quality flags
    has_valid_gps               BOOLEAN NOT NULL DEFAULT TRUE,
    is_flagged                  BOOLEAN NOT NULL DEFAULT FALSE,
    flag_reason                 TEXT,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_geo_images_location ON geo_images USING GIST (location);
CREATE INDEX idx_geo_images_watershed ON geo_images (watershed_id);
CREATE INDEX idx_geo_images_stage ON geo_images (observation_stage);
CREATE INDEX idx_geo_images_type ON geo_images (intervention_type);
CREATE INDEX idx_geo_images_captured ON geo_images (captured_at);

COMMENT ON TABLE geo_images IS 'Geo-coded field photographs with spatial, temporal, and satellite-derived attributes';
COMMENT ON COLUMN geo_images.file_path IS 'MinIO object key, e.g. images/2024/rajsamand/photo_001.jpg';

-- =============================================================================
-- TABLE: thematic_layers
-- Metadata catalog for satellite-derived raster layers (actual data = GeoTIFF in MinIO)
-- =============================================================================
CREATE TABLE thematic_layers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    watershed_id        UUID REFERENCES watersheds(id) ON DELETE CASCADE,  -- NULL = global layer
    layer_type          layer_type NOT NULL,
    period_label        VARCHAR(50) NOT NULL,                -- Human label: "Pre-monsoon 2023", "Post-monsoon 2024"
    period_slug         VARCHAR(50) NOT NULL,                -- Machine slug: "2023-pre", "2024-post"
    date_start          DATE NOT NULL,
    date_end            DATE NOT NULL,
    satellite_source    VARCHAR(100) NOT NULL DEFAULT 'Landsat8_C2L2', -- e.g. 'Landsat8_C2L2', 'Sentinel2_L2A', 'SRISHTI_DRISHTI'
    scene_id            VARCHAR(200),                        -- Source scene/product ID for traceability

    -- Storage
    file_path           VARCHAR(500) NOT NULL,               -- MinIO path to COG GeoTIFF
    tile_url_template   VARCHAR(500),                        -- TiTiler endpoint pattern

    -- Spatial extent
    bbox                GEOMETRY(POLYGON, 4326),
    srid                INT DEFAULT 4326,
    pixel_size_m        FLOAT DEFAULT 30.0,

    -- Band statistics (for colormap/stretch in frontend)
    stats               JSONB,                               -- {"min": 0.0, "max": 1.0, "mean": 0.42, "std": 0.18}
    colormap            VARCHAR(50) DEFAULT 'RdYlGn',        -- Matplotlib colormap name

    -- Adapter tracking (which data source adapter produced this)
    adapter_class       VARCHAR(100) DEFAULT 'LandsatAdapter',
    processing_notes    TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_layers_watershed ON thematic_layers (watershed_id);
CREATE INDEX idx_layers_type ON thematic_layers (layer_type);
CREATE INDEX idx_layers_period ON thematic_layers (period_slug);
CREATE INDEX idx_layers_bbox ON thematic_layers USING GIST (bbox);

COMMENT ON TABLE thematic_layers IS 'Catalog of satellite-derived thematic raster layers. Actual data stored as COG GeoTIFFs in MinIO, served via TiTiler.';

-- =============================================================================
-- TABLE: watershed_stats  (time-series KPI data)
-- Pre-aggregated stats for dashboard charts — populated by geoprocessing pipeline
-- =============================================================================
CREATE TABLE watershed_stats (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    watershed_id        UUID NOT NULL REFERENCES watersheds(id) ON DELETE CASCADE,
    sub_watershed_id    UUID REFERENCES sub_watersheds(id) ON DELETE SET NULL,
    recorded_date       DATE NOT NULL,
    period_label        VARCHAR(50),

    -- Vegetation metrics
    ndvi_mean           FLOAT,
    ndvi_min            FLOAT,
    ndvi_max            FLOAT,
    vegetation_ha       FLOAT,                   -- Area with NDVI > 0.3
    dense_veg_ha        FLOAT,                   -- Area with NDVI > 0.5

    -- Water metrics
    ndwi_mean           FLOAT,
    water_spread_ha     FLOAT,                   -- Area with NDWI > 0.0 (open water)
    moisture_ha         FLOAT,                   -- Area with NDWI > -0.2 (soil moisture)

    -- Land cover (hectares per class)
    bare_land_ha        FLOAT,
    agricultural_ha     FLOAT,
    built_up_ha         FLOAT,

    -- Field image counts
    image_count         INT DEFAULT 0,
    image_pre_count     INT DEFAULT 0,
    image_post_count    INT DEFAULT 0,

    source_layer_id     UUID REFERENCES thematic_layers(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(watershed_id, sub_watershed_id, recorded_date)
);

CREATE INDEX idx_stats_watershed_date ON watershed_stats (watershed_id, recorded_date);

-- =============================================================================
-- TABLE: reports
-- =============================================================================
CREATE TABLE reports (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    watershed_id    UUID NOT NULL REFERENCES watersheds(id) ON DELETE CASCADE,
    title           VARCHAR(500) NOT NULL,
    generated_by    UUID REFERENCES users(id),
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    file_path       VARCHAR(500),                -- MinIO path to generated PDF
    summary_stats   JSONB,                       -- Snapshot of KPIs at generation time
    status          VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed'))
);

-- =============================================================================
-- TABLE: audit_logs
-- =============================================================================
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(100) NOT NULL,        -- e.g. 'IMAGE_UPLOAD', 'LAYER_VIEW', 'REPORT_GENERATE'
    entity_type     VARCHAR(100),                 -- e.g. 'geo_image', 'watershed', 'report'
    entity_id       UUID,
    ip_address      INET,
    user_agent      TEXT,
    metadata        JSONB,                        -- Additional context
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs (user_id);
CREATE INDEX idx_audit_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_logs (created_at DESC);

-- =============================================================================
-- UTILITY: Auto-update updated_at timestamps
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_watersheds_updated_at BEFORE UPDATE ON watersheds FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_geo_images_updated_at BEFORE UPDATE ON geo_images FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
