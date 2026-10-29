-- =============================================================================
-- WorldRisk Atlas — production schema (PostgreSQL 15+ / PostGIS 3)
-- =============================================================================
-- This is the deployment target schema. The sandbox MVP runs the same model on
-- SQLite via Prisma (prisma/schema.prisma); in production the Yii2 backend
-- (backend-yii2/) owns these tables and serves the identical REST contract.
--
-- Usage:
--   psql -c "CREATE DATABASE worldrisk_atlas;"
--   psql -d worldrisk_atlas -c "CREATE EXTENSION IF NOT EXISTS postgis;"
--   psql -d worldrisk_atlas -f docs/schema-postgis.sql
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- fast ILIKE search on names

-- -----------------------------------------------------------------------------
-- Data source registry — every row of data must trace back here.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_source (
  id                    BIGSERIAL PRIMARY KEY,
  key                   TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  provider              TEXT NOT NULL,
  homepage_url          TEXT NOT NULL,
  license_name          TEXT NOT NULL,
  license_url           TEXT NOT NULL,
  endpoint_url          TEXT NOT NULL,
  access_mode           TEXT NOT NULL DEFAULT 'bulk',      -- bulk | on_demand
  cadence_hours         INTEGER NOT NULL DEFAULT 6,
  requires_api_key_env  TEXT,
  api_key_present       BOOLEAN NOT NULL DEFAULT FALSE,
  enabled               BOOLEAN NOT NULL DEFAULT TRUE,
  status                TEXT NOT NULL DEFAULT 'active',    -- active | needs_config | disabled | auto_disabled | failed
  status_reason         TEXT,
  last_success_at       TIMESTAMPTZ,
  last_attempt_at       TIMESTAMPTZ,
  consecutive_failures  INTEGER NOT NULL DEFAULT 0,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Hazard layers (extensible layer system; availability computed from imports)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hazard_layer (
  id               BIGSERIAL PRIMARY KEY,
  key              TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  hazard_type      TEXT NOT NULL,
  kind             TEXT NOT NULL,                          -- observation | event | model | projection
  description      TEXT NOT NULL,
  units            TEXT,
  methodology      TEXT,
  resolution       TEXT,
  temporal_coverage TEXT,
  license_name     TEXT,
  license_url      TEXT,
  limitations      TEXT,
  source_key       TEXT REFERENCES data_source(key),
  color_hex        TEXT NOT NULL DEFAULT '#57534e',
  map_available    BOOLEAN NOT NULL DEFAULT FALSE,
  available        BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order       INTEGER NOT NULL DEFAULT 100,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Hazard observations — quantitative point measurements
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hazard_observation (
  id             BIGSERIAL PRIMARY KEY,
  source_id      BIGINT NOT NULL REFERENCES data_source(id),
  layer_id       BIGINT NOT NULL REFERENCES hazard_layer(id),
  external_id    TEXT NOT NULL,                            -- provider-native id (dedup key)
  lat            DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng            DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  geom           geography(Point, 4326)
                 GENERATED ALWAYS AS
                 (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED,
  magnitude      DOUBLE PRECISION,
  magnitude_type TEXT,
  depth_km       DOUBLE PRECISION,
  value          DOUBLE PRECISION,
  unit           TEXT,
  severity_label TEXT,
  place          TEXT,
  country_code   TEXT,
  occurred_at    TIMESTAMPTZ NOT NULL,
  source_url     TEXT,
  raw_json       JSONB,
  ingested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_obs_layer_time ON hazard_observation (layer_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_geom       ON hazard_observation USING GIST (geom);

-- -----------------------------------------------------------------------------
-- Disaster events — documented events (separate from observations)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disaster_event (
  id                  BIGSERIAL PRIMARY KEY,
  source_id           BIGINT NOT NULL REFERENCES data_source(id),
  external_id         TEXT NOT NULL,
  title               TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  kind                TEXT NOT NULL DEFAULT 'historical', -- historical | active | model | projection
  lat                 DOUBLE PRECISION CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  lng                 DOUBLE PRECISION CHECK (lng IS NULL OR lng BETWEEN -180 AND 180),
  geom                geography(Point, 4326)
                      GENERATED ALWAYS AS
                      (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED,
  place_name          TEXT,
  country_name        TEXT,
  country_code        TEXT,
  start_date          TIMESTAMPTZ,
  end_date            TIMESTAMPTZ,
  severity_label      TEXT,
  severity_value      DOUBLE PRECISION,
  severity_unit       TEXT,
  affected_count      INTEGER,
  source_name         TEXT NOT NULL,
  source_url          TEXT,
  source_published_at TIMESTAMPTZ,
  verification_status TEXT NOT NULL DEFAULT 'source_reported', -- source_reported | cross_verified | unverified
  summary             TEXT,
  ingested_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_event_type_date ON disaster_event (event_type, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_event_kind      ON disaster_event (kind);
CREATE INDEX IF NOT EXISTS idx_event_geom      ON disaster_event USING GIST (geom);

-- -----------------------------------------------------------------------------
-- Ingestion runs — full audit trail
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingestion_run (
  id               BIGSERIAL PRIMARY KEY,
  source_id        BIGINT NOT NULL REFERENCES data_source(id),
  status           TEXT NOT NULL,                         -- running | success | partial | failed
  trigger          TEXT NOT NULL DEFAULT 'manual',        -- manual | scheduled | bootstrap
  attempt          INTEGER NOT NULL DEFAULT 1,
  records_fetched  INTEGER NOT NULL DEFAULT 0,
  records_inserted INTEGER NOT NULL DEFAULT 0,
  records_updated  INTEGER NOT NULL DEFAULT 0,
  records_skipped  INTEGER NOT NULL DEFAULT 0,
  records_invalid  INTEGER NOT NULL DEFAULT 0,
  dataset_version  TEXT,
  error_message    TEXT,
  duration_ms      INTEGER,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_run_source_time ON ingestion_run (source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_status      ON ingestion_run (status);

-- -----------------------------------------------------------------------------
-- User-submitted corrections
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS correction (
  id              BIGSERIAL PRIMARY KEY,
  target_type     TEXT NOT NULL,                          -- event | observation | location
  target_id       TEXT,
  target_label    TEXT,
  field           TEXT,
  proposed_value  TEXT,
  message         TEXT NOT NULL,
  submitter_email TEXT,
  status          TEXT NOT NULL DEFAULT 'open',           -- open | resolved | rejected
  admin_note      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_correction_status ON correction (status, created_at DESC);

-- -----------------------------------------------------------------------------
-- Saved locations (monetization-ready extension point)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_location (
  id           BIGSERIAL PRIMARY KEY,
  session_id   TEXT NOT NULL,
  label        TEXT NOT NULL,
  latitude     DOUBLE PRECISION NOT NULL,
  longitude    DOUBLE PRECISION NOT NULL,
  country_name TEXT,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_saved_session ON saved_location (session_id);

-- -----------------------------------------------------------------------------
-- Example: nearby-events query used by the location service (300 km, 365 days)
-- -----------------------------------------------------------------------------
-- SELECT * FROM disaster_event
-- WHERE start_date >= now() - interval '365 days'
--   AND geom IS NOT NULL
--   AND ST_DWithin(geom, ST_MakePoint(:lng, :lat)::geography, :radius_meters)
-- ORDER BY start_date DESC LIMIT 25;
