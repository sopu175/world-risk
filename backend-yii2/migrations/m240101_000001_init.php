<?php

use yii\db\Migration;

/**
 * WorldRisk Atlas — initial schema (PostgreSQL 15+ / PostGIS 3) and registry
 * seed. Mirrors docs/schema-postgis.sql exactly; that file remains the
 * reference DDL for DBAs who prefer psql-based provisioning.
 */
final class m240101_000001_init extends Migration
{
    public function safeUp()
    {
        $this->execute('CREATE EXTENSION IF NOT EXISTS postgis');
        $this->execute('CREATE EXTENSION IF NOT EXISTS pg_trgm');

        // ------------------------------------------------------------------
        // data_source
        // ------------------------------------------------------------------
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS data_source (
  id                    BIGSERIAL PRIMARY KEY,
  key                   TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  provider              TEXT NOT NULL,
  homepage_url          TEXT NOT NULL,
  license_name          TEXT NOT NULL,
  license_url           TEXT NOT NULL,
  endpoint_url          TEXT NOT NULL,
  access_mode           TEXT NOT NULL DEFAULT 'bulk',
  cadence_hours         INTEGER NOT NULL DEFAULT 6,
  requires_api_key_env  TEXT,
  api_key_present       BOOLEAN NOT NULL DEFAULT FALSE,
  enabled               BOOLEAN NOT NULL DEFAULT TRUE,
  status                TEXT NOT NULL DEFAULT 'active',
  status_reason         TEXT,
  last_success_at       TIMESTAMPTZ,
  last_attempt_at       TIMESTAMPTZ,
  consecutive_failures  INTEGER NOT NULL DEFAULT 0,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
)
SQL);

        // ------------------------------------------------------------------
        // hazard_layer
        // ------------------------------------------------------------------
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS hazard_layer (
  id               BIGSERIAL PRIMARY KEY,
  key              TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  hazard_type      TEXT NOT NULL,
  kind             TEXT NOT NULL,
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
)
SQL);

        // ------------------------------------------------------------------
        // hazard_observation
        // ------------------------------------------------------------------
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS hazard_observation (
  id             BIGSERIAL PRIMARY KEY,
  source_id      BIGINT NOT NULL REFERENCES data_source(id),
  layer_id       BIGINT NOT NULL REFERENCES hazard_layer(id),
  external_id    TEXT NOT NULL,
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
)
SQL);
        $this->execute('CREATE INDEX IF NOT EXISTS idx_obs_layer_time ON hazard_observation (layer_id, occurred_at DESC)');
        $this->execute('CREATE INDEX IF NOT EXISTS idx_obs_geom ON hazard_observation USING GIST (geom)');

        // ------------------------------------------------------------------
        // disaster_event
        // ------------------------------------------------------------------
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS disaster_event (
  id                  BIGSERIAL PRIMARY KEY,
  source_id           BIGINT NOT NULL REFERENCES data_source(id),
  external_id         TEXT NOT NULL,
  title               TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  kind                TEXT NOT NULL DEFAULT 'historical',
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
  verification_status TEXT NOT NULL DEFAULT 'source_reported',
  summary             TEXT,
  ingested_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_id)
)
SQL);
        $this->execute('CREATE INDEX IF NOT EXISTS idx_event_type_date ON disaster_event (event_type, start_date DESC)');
        $this->execute('CREATE INDEX IF NOT EXISTS idx_event_kind ON disaster_event (kind)');
        $this->execute('CREATE INDEX IF NOT EXISTS idx_event_geom ON disaster_event USING GIST (geom)');

        // ------------------------------------------------------------------
        // ingestion_run
        // ------------------------------------------------------------------
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS ingestion_run (
  id               BIGSERIAL PRIMARY KEY,
  source_id        BIGINT NOT NULL REFERENCES data_source(id),
  status           TEXT NOT NULL,
  trigger          TEXT NOT NULL DEFAULT 'manual',
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
)
SQL);
        $this->execute('CREATE INDEX IF NOT EXISTS idx_run_source_time ON ingestion_run (source_id, started_at DESC)');
        $this->execute('CREATE INDEX IF NOT EXISTS idx_run_status ON ingestion_run (status)');

        // ------------------------------------------------------------------
        // correction
        // ------------------------------------------------------------------
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS correction (
  id              BIGSERIAL PRIMARY KEY,
  target_type     TEXT NOT NULL,
  target_id       TEXT,
  target_label    TEXT,
  field           TEXT,
  proposed_value  TEXT,
  message         TEXT NOT NULL,
  submitter_email TEXT,
  status          TEXT NOT NULL DEFAULT 'open',
  admin_note      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
)
SQL);
        $this->execute('CREATE INDEX IF NOT EXISTS idx_correction_status ON correction (status, created_at DESC)');

        // ------------------------------------------------------------------
        // saved_location
        // ------------------------------------------------------------------
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS saved_location (
  id           BIGSERIAL PRIMARY KEY,
  session_id   TEXT NOT NULL,
  label        TEXT NOT NULL,
  latitude     DOUBLE PRECISION NOT NULL,
  longitude    DOUBLE PRECISION NOT NULL,
  country_name TEXT,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
)
SQL);
        $this->execute('CREATE INDEX IF NOT EXISTS idx_saved_session ON saved_location (session_id)');

        $this->seedSources();
        $this->seedLayers();
    }

    public function safeDown()
    {
        $this->execute('DROP TABLE IF EXISTS saved_location CASCADE');
        $this->execute('DROP TABLE IF EXISTS correction CASCADE');
        $this->execute('DROP TABLE IF EXISTS ingestion_run CASCADE');
        $this->execute('DROP TABLE IF EXISTS disaster_event CASCADE');
        $this->execute('DROP TABLE IF EXISTS hazard_observation CASCADE');
        $this->execute('DROP TABLE IF EXISTS hazard_layer CASCADE');
        $this->execute('DROP TABLE IF EXISTS data_source CASCADE');
    }

    private function seedSources(): void
    {
        $now = gmdate('Y-m-d\TH:i:s\Z');
        $sources = [
            ['usgs-earthquakes', 'USGS Earthquake Hazards Program — M2.5+ 30-day feed', 'U.S. Geological Survey', 'https://earthquake.usgs.gov/earthquakes/feed/', 'Public domain (U.S. Government work)', 'https://www.usgs.gov/information-policies-and-instructions', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson', 'bulk', 3, null, null, 'Official composite catalog feed. Record dedup key: USGS event id.'],
            ['nasa-eonet', 'NASA EONET v3 — natural event tracker', 'NASA Earth Observatory', 'https://eonet.gsfc.nasa.gov/', 'Public domain (NASA)', 'https://eonet.gsfc.nasa.gov/api/v3', 'https://eonet.gsfc.nasa.gov/api/v3/events?status=all&days=365&limit=500', 'bulk', 6, null, null, 'Aggregates events from official agencies (JTWC, DFO, Smithsonian GVP, national services). Record dedup key: EONET event id.'],
            ['reliefweb-disasters', 'ReliefWeb Disasters API v2', 'UN OCHA ReliefWeb', 'https://reliefweb.int', 'ReliefWeb content is reusable with attribution to the original source', 'https://reliefweb.int/terms-of-use', 'https://api.reliefweb.int/v2/disasters', 'bulk', 6, 'RELIEFWEB_APPNAME', 'Requires a registered, approved appname from OCHA. Until RELIEFWEB_APPNAME is configured this source stays in needs_config and contributes no data.', null],
            ['nasa-firms', 'NASA FIRMS active fire detections (VIIRS/Suomi-NPP)', 'NASA FIRMS', 'https://firms.modaps.eosdis.nasa.gov/', 'Public domain (NASA); cite FIRMS/NASA as data source', 'https://earthdata.nasa.gov/earth-observation-data/near-real-time/firms/attributions', 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/', 'bulk', 6, 'FIRMS_MAP_KEY', 'Free MAP_KEY registration required. Planned integration scope: per-map-viewport hotspot queries. No hotspot data is loaded until the key is configured and the adapter is validated.', null],
            ['openmeteo-geocoding', 'Open-Meteo Geocoding API (GeoNames)', 'Open-Meteo / GeoNames', 'https://open-meteo.com/en/docs/geocoding-api', 'CC-BY 4.0', 'https://open-meteo.com/en/license', 'https://geocoding-api.open-meteo.com/v1/search', 'on_demand', 0, null, null, 'Location search only; queried on demand, never bulk-ingested.'],
            ['osm-nominatim', 'OSM Nominatim reverse geocoding', 'OpenStreetMap Foundation', 'https://nominatim.openstreetmap.org/', 'ODbL 1.0 (© OpenStreetMap contributors)', 'https://www.openstreetmap.org/copyright', 'https://nominatim.openstreetmap.org/reverse', 'on_demand', 0, null, null, 'Reverse geocoding for map-click context. Used at ≤1 req/s with 24 h caching per OSMF usage policy.'],
            ['openmeteo-era5', 'Open-Meteo ERA5 Historical Archive', 'Open-Meteo / Copernicus C3S (ECMWF ERA5)', 'https://open-meteo.com/en/docs/historical-weather-api', 'CC-BY 4.0', 'https://open-meteo.com/en/license', 'https://archive-api.open-meteo.com/v1/archive', 'on_demand', 0, null, null, 'Daily Tmax series for location heat indicators; computed on demand and cached per grid cell.'],
            ['openmeteo-cams', 'Open-Meteo Air Quality API (CAMS)', 'Open-Meteo / Copernicus CAMS', 'https://open-meteo.com/en/docs/air-quality-api', 'CC-BY 4.0', 'https://open-meteo.com/en/license', 'https://air-quality-api.open-meteo.com/v1/air-quality', 'on_demand', 0, null, null, 'Hourly PM2.5 series for location air-quality indicators; on demand only.'],
        ];

        foreach ($sources as [$key, $name, $provider, $home, $licenseName, $licenseUrl, $endpoint, $mode, $cadence, $envVar, $notes1, $notes2]) {
            $needsConfig = $envVar !== null;
            $status = $needsConfig ? 'needs_config' : 'active';
            $reason = $needsConfig ? sprintf('Requires the %s environment variable (free registration with the provider).', $envVar) : ($mode === 'bulk' && $key === 'nasa-firms' ? 'Ingestion adapter is pending validation — no data is loaded until then.' : null);
            $this->insert('data_source', [
                'key' => $key,
                'name' => $name,
                'provider' => $provider,
                'homepage_url' => $home,
                'license_name' => $licenseName,
                'license_url' => $licenseUrl,
                'endpoint_url' => $endpoint,
                'access_mode' => $mode,
                'cadence_hours' => $cadence,
                'requires_api_key_env' => $envVar,
                'api_key_present' => false,
                'enabled' => !$needsConfig,
                'status' => $status,
                'status_reason' => $reason,
                'notes' => $notes1 ?? $notes2,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    private function seedLayers(): void
    {
        $now = gmdate('Y-m-d\TH:i:s\Z');
        $legend = json_encode([
            ['label' => 'M 2.5 – 3.9', 'color' => '#fbbf24', 'min' => 2.5, 'max' => 4],
            ['label' => 'M 4.0 – 4.9', 'color' => '#f59e0b', 'min' => 4, 'max' => 5],
            ['label' => 'M 5.0 – 5.9', 'color' => '#d97706', 'min' => 5, 'max' => 6],
            ['label' => 'M 6.0 – 6.9', 'color' => '#c2410c', 'min' => 6, 'max' => 7],
            ['label' => 'M ≥ 7.0', 'color' => '#991b1b', 'min' => 7],
        ], JSON_UNESCAPED_UNICODE);

        $layers = [
            ['earthquake', 'Earthquakes', 'earthquake', 'observation', 'Recorded earthquake epicentres (magnitude 2.5+) from the USGS global seismic network, refreshed from the official 30-day feed.', 'moment/local magnitude (M), depth in km', 'Point observations published by the USGS Earthquake Hazards Program. Magnitude and depth are taken verbatim from the feed; magnitudes may be revised by source networks after review.', 'point (global seismic network, hypocentre projected to surface)', 'rolling 30 days (map); 10-year catalog excerpt in location views', 'Public domain (U.S. Government work)', 'https://www.usgs.gov/information-policies-and-instructions', 'Detection completeness decreases with magnitude and oceanic coverage; small events are missing in poorly instrumented regions. Epicentre ≠ felt impact.', 'usgs-earthquakes', '#d97706', true, 5, $legend],
            ['wildfire', 'Wildfires', 'wildfire', 'event', 'Documented wildfire events aggregated by NASA EONET from official agencies (e.g. FIRMS, national forestry services).', 'event reports; per-event area/energy where the source provides it', "Event-level records curated by NASA's Earth Observatory Natural Event Tracker (EONET v3). Positions are representative event coordinates, not fire perimeters.", 'point/track per event', 'rolling 12 months of EONET records', 'Public domain (NASA)', 'https://eonet.gsfc.nasa.gov/api/v3', 'Only events that agencies report to EONET; small or short-lived fires are under-represented. Hotspot raster layers (NASA FIRMS) require an API key and are not yet enabled.', 'nasa-eonet', '#ea580c', true, 10, null],
            ['flood', 'Floods', 'flood', 'event', 'Documented flood events reported to NASA EONET by hydrometeorological agencies (e.g. DFO — Dartmouth Flood Observatory).', 'event reports; severity where the source provides it', 'Event-level records from EONET v3; positions are representative coordinates of the reported flood area.', 'point per event', 'rolling 12 months of EONET records', 'Public domain (NASA)', 'https://eonet.gsfc.nasa.gov/api/v3', 'Flood extent modelling (e.g. WRI Aqueduct) is not yet imported; event points do not delineate inundation area and cannot certify that any specific plot is flood-free.', 'nasa-eonet', '#0d9488', true, 15, null],
            ['cyclone', 'Tropical cyclones & severe storms', 'cyclone', 'event', 'Tropical cyclone and severe storm events from NASA EONET, with maximum sustained wind magnitude where JTWC/JMA provide it.', 'maximum sustained wind (knots) where reported', 'EONET v3 event tracks; the ingested position is the latest known track point, start/end dates from the event lifecycle, severity from reported wind magnitude.', 'track point per event', 'rolling 12 months of EONET records', 'Public domain (NASA)', 'https://eonet.gsfc.nasa.gov/api/v3', 'Forecast cones and warning polygons are not included; positions can lag official advisories by hours.', 'nasa-eonet', '#9333ea', true, 20, null],
            ['drought', 'Drought', 'drought', 'event', 'Documented drought episodes reported to NASA EONET (sparse — agencies report major episodes only).', 'event reports', 'EONET v3 event records; droughts are regional — coordinates are representative, not boundaries.', 'point per event (regional episodes)', 'rolling 12 months of EONET records', 'Public domain (NASA)', 'https://eonet.gsfc.nasa.gov/api/v3', 'EONET drought reporting is sparse. SPI/SPEI precipitation-index modelling is not yet imported, so absence of a marker does not imply absence of drought.', 'nasa-eonet', '#ca8a04', true, 25, null],
            ['landslide', 'Landslides', 'landslide', 'event', 'Documented landslide events reported to NASA EONET (largely from the NASA/CGS landslide catalog).', 'event reports', 'EONET v3 event records at reported trigger coordinates.', 'point per event', 'rolling 12 months of EONET records', 'Public domain (NASA)', 'https://eonet.gsfc.nasa.gov/api/v3', 'Susceptibility modelling (slope, soil, rainfall) is not imported; catalogued events are strongly biased to populated, reported areas.', 'nasa-eonet', '#854d0e', true, 30, null],
            ['volcano', 'Volcanic activity', 'volcano', 'event', 'Eruptive activity reported to NASA EONET from Smithsonian GVP and volcano observatories.', 'event reports; plume elevation where reported', 'EONET v3 event records at volcano coordinates.', 'point per event', 'rolling 12 months of EONET records', 'Public domain (NASA)', 'https://eonet.gsfc.nasa.gov/api/v3', 'Ash cloud advisories (VAAC) are not included.', 'nasa-eonet', '#b91c1c', true, 35, null],
            ['extreme_heat', 'Extreme heat', 'extreme_heat', 'observation', 'Heat-stress indicators computed per searched location from the ERA5 reanalysis: hot days per year (Tmax ≥ 35 °C, auto-scaled in cool climates) and decadal trends.', 'days/year above threshold; °C', 'Daily maximum temperature 1995–2024 from Open-Meteo ERA5 Archive (Copernicus/ECMWF ERA5). Hot-day threshold 35 °C, lowered where the local 95th percentile Tmax is lower; trend compares the last 5 years against the 1995–2024 mean.', '≈ 25–31 km reanalysis grid cell (not street-level)', '1995 – present (reanalysis has ~5 day latency)', 'CC-BY 4.0 (Open-Meteo / Copernicus ERA5)', 'https://open-meteo.com/en/license', 'Reanalysis grid cells average over wide areas — unsuitable for intra-urban heat islands. Computed on demand per location; no global gridded map import is configured, so this is not shown as a map layer.', 'openmeteo-era5', '#dc2626', false, 40, null],
            ['air_quality', 'Air quality (PM2.5)', 'air_quality', 'observation', 'Recent PM2.5 concentrations for searched locations from the Copernicus Atmosphere Monitoring Service via Open-Meteo.', 'μg/m³ (PM2.5, 72-hour hourly series)', 'CAMS global atmospheric composition forecasts/analyses via the Open-Meteo Air Quality API. WHO 24-hour guideline: 15 μg/m³.', '≈ 40 km CAMS grid cell', 'past 72 hours + next 24 h', 'CC-BY 4.0 (Open-Meteo / CAMS)', 'https://open-meteo.com/en/license', 'Model output, not ground sensors — local pollution hotspots (roads, industry) are not resolved. No global map import configured; shown per location only.', 'openmeteo-cams', '#4d7c0f', false, 45, null],
        ];

        foreach ($layers as $layer) {
            $this->insert('hazard_layer', [
                'key' => $layer[0],
                'name' => $layer[1],
                'hazard_type' => $layer[2],
                'kind' => $layer[3],
                'description' => $layer[4],
                'units' => $layer[5],
                'methodology' => $layer[6],
                'resolution' => $layer[7],
                'temporal_coverage' => $layer[8],
                'license_name' => $layer[9],
                'license_url' => $layer[10],
                'limitations' => $layer[11],
                'source_key' => $layer[12],
                'color_hex' => $layer[13],
                'map_available' => $layer[14],
                'available' => false,
                'sort_order' => $layer[15],
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }
}
