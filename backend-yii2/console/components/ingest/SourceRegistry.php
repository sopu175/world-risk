<?php

namespace console\components\ingest;

/**
 * Data-source registry — mirrors the sandbox registry (src/lib/ingest/sources.ts).
 * Every upstream endpoint is fixed and allow-listed in Upstream; raw user URLs
 * are never fetched. Adapter classes implement IngestAdapterInterface.
 */
final class SourceRegistry
{
    /**
     * @return array<string, array{
     *   key:string, name:string, provider:string, homepageUrl:string,
     *   licenseName:string, licenseUrl:string, endpointUrl:string,
     *   accessMode:string, cadenceHours:int, requiresApiKeyEnv:?string,
     *   notes:?string, adapter:class-string|null
     * }>
     */
    public static function defs(): array
    {
        return [
            'usgs-earthquakes' => [
                'key' => 'usgs-earthquakes',
                'name' => 'USGS Earthquake Hazards Program — M2.5+ 30-day feed',
                'provider' => 'U.S. Geological Survey',
                'homepageUrl' => 'https://earthquake.usgs.gov/earthquakes/feed/',
                'licenseName' => 'Public domain (U.S. Government work)',
                'licenseUrl' => 'https://www.usgs.gov/information-policies-and-instructions',
                'endpointUrl' => 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson',
                'accessMode' => 'bulk',
                'cadenceHours' => 3,
                'requiresApiKeyEnv' => null,
                'notes' => 'Official composite catalog feed. Record dedup key: USGS event id.',
                'adapter' => UsgsEarthquakes::class,
            ],
            'nasa-eonet' => [
                'key' => 'nasa-eonet',
                'name' => 'NASA EONET v3 — natural event tracker',
                'provider' => 'NASA Earth Observatory',
                'homepageUrl' => 'https://eonet.gsfc.nasa.gov/',
                'licenseName' => 'Public domain (NASA)',
                'licenseUrl' => 'https://eonet.gsfc.nasa.gov/api/v3',
                'endpointUrl' => 'https://eonet.gsfc.nasa.gov/api/v3/events?status=all&days=365&limit=500',
                'accessMode' => 'bulk',
                'cadenceHours' => 6,
                'requiresApiKeyEnv' => null,
                'notes' => 'Aggregates events from official agencies (JTWC, DFO, Smithsonian GVP, national services). Record dedup key: EONET event id.',
                'adapter' => NasaEonet::class,
            ],
            'reliefweb-disasters' => [
                'key' => 'reliefweb-disasters',
                'name' => 'ReliefWeb Disasters API v2',
                'provider' => 'UN OCHA ReliefWeb',
                'homepageUrl' => 'https://reliefweb.int',
                'licenseName' => 'ReliefWeb content is reusable with attribution to the original source',
                'licenseUrl' => 'https://reliefweb.int/terms-of-use',
                'endpointUrl' => 'https://api.reliefweb.int/v2/disasters',
                'accessMode' => 'bulk',
                'cadenceHours' => 6,
                'requiresApiKeyEnv' => 'RELIEFWEB_APPNAME',
                'notes' => 'Requires a registered, approved appname from OCHA. Until RELIEFWEB_APPNAME is configured this source stays in needs_config and contributes no data.',
                'adapter' => ReliefwebDisasters::class,
            ],
            'nasa-firms' => [
                'key' => 'nasa-firms',
                'name' => 'NASA FIRMS active fire detections (VIIRS/Suomi-NPP)',
                'provider' => 'NASA FIRMS',
                'homepageUrl' => 'https://firms.modaps.eosdis.nasa.gov/',
                'licenseName' => 'Public domain (NASA); cite FIRMS/NASA as data source',
                'licenseUrl' => 'https://earthdata.nasa.gov/earth-observation-data/near-real-time/firms/attributions',
                'endpointUrl' => 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/',
                'accessMode' => 'bulk',
                'cadenceHours' => 6,
                'requiresApiKeyEnv' => 'FIRMS_MAP_KEY',
                'notes' => 'Free MAP_KEY registration required. Planned integration scope: per-map-viewport hotspot queries. No hotspot data is loaded until the key is configured and the adapter is validated.',
                'adapter' => null,
            ],
            'openmeteo-geocoding' => [
                'key' => 'openmeteo-geocoding',
                'name' => 'Open-Meteo Geocoding API (GeoNames)',
                'provider' => 'Open-Meteo / GeoNames',
                'homepageUrl' => 'https://open-meteo.com/en/docs/geocoding-api',
                'licenseName' => 'CC-BY 4.0',
                'licenseUrl' => 'https://open-meteo.com/en/license',
                'endpointUrl' => 'https://geocoding-api.open-meteo.com/v1/search',
                'accessMode' => 'on_demand',
                'cadenceHours' => 0,
                'requiresApiKeyEnv' => null,
                'notes' => 'Location search only; queried on demand, never bulk-ingested.',
                'adapter' => null,
            ],
            'osm-nominatim' => [
                'key' => 'osm-nominatim',
                'name' => 'OSM Nominatim reverse geocoding',
                'provider' => 'OpenStreetMap Foundation',
                'homepageUrl' => 'https://nominatim.openstreetmap.org/',
                'licenseName' => 'ODbL 1.0 (© OpenStreetMap contributors)',
                'licenseUrl' => 'https://www.openstreetmap.org/copyright',
                'endpointUrl' => 'https://nominatim.openstreetmap.org/reverse',
                'accessMode' => 'on_demand',
                'cadenceHours' => 0,
                'requiresApiKeyEnv' => null,
                'notes' => 'Reverse geocoding for map-click context. Used at ≤1 req/s with 24 h caching per OSMF usage policy.',
                'adapter' => null,
            ],
            'openmeteo-era5' => [
                'key' => 'openmeteo-era5',
                'name' => 'Open-Meteo ERA5 Historical Archive',
                'provider' => 'Open-Meteo / Copernicus C3S (ECMWF ERA5)',
                'homepageUrl' => 'https://open-meteo.com/en/docs/historical-weather-api',
                'licenseName' => 'CC-BY 4.0',
                'licenseUrl' => 'https://open-meteo.com/en/license',
                'endpointUrl' => 'https://archive-api.open-meteo.com/v1/archive',
                'accessMode' => 'on_demand',
                'cadenceHours' => 0,
                'requiresApiKeyEnv' => null,
                'notes' => 'Daily Tmax series for location heat indicators; computed on demand and cached per grid cell.',
                'adapter' => null,
            ],
            'openmeteo-cams' => [
                'key' => 'openmeteo-cams',
                'name' => 'Open-Meteo Air Quality API (CAMS)',
                'provider' => 'Open-Meteo / Copernicus CAMS',
                'homepageUrl' => 'https://open-meteo.com/en/docs/air-quality-api',
                'licenseName' => 'CC-BY 4.0',
                'licenseUrl' => 'https://open-meteo.com/en/license',
                'endpointUrl' => 'https://air-quality-api.open-meteo.com/v1/air-quality',
                'accessMode' => 'on_demand',
                'cadenceHours' => 0,
                'requiresApiKeyEnv' => null,
                'notes' => 'Hourly PM2.5 series for location air-quality indicators; on demand only.',
                'adapter' => null,
            ],
        ];
    }

    /** @return array<string, mixed>|null */
    public static function def(string $key): ?array
    {
        return self::defs()[$key] ?? null;
    }
}
