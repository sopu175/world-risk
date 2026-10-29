<?php
/**
 * WorldRisk Atlas — shared application parameters.
 *
 * Static metadata that is deliberately NOT stored in the database:
 *  - the earthquake magnitude legend (rendering concern, mirrors
 *    src/lib/hazard-meta.ts EARTHQUAKE_MAGNITUDE_LEGEND),
 *  - the "no data yet" status reason per layer,
 *  - the reference cities used by POST /v1/locations/compare.
 */

return [
    'earthquakeLegend' => [
        ['label' => 'M 2.5 – 3.9', 'color' => '#fbbf24', 'min' => 2.5, 'max' => 4],
        ['label' => 'M 4.0 – 4.9', 'color' => '#f59e0b', 'min' => 4, 'max' => 5],
        ['label' => 'M 5.0 – 5.9', 'color' => '#d97706', 'min' => 5, 'max' => 6],
        ['label' => 'M 6.0 – 6.9', 'color' => '#c2410c', 'min' => 6, 'max' => 7],
        ['label' => 'M ≥ 7.0', 'color' => '#991b1b', 'min' => 7],
    ],

    'layerStatusReasonNoData' => [
        'earthquake' => 'Waiting for the first validated import from the USGS feed.',
        'wildfire' => 'Waiting for the first validated EONET import.',
        'flood' => 'Waiting for the first validated EONET import.',
        'cyclone' => 'Waiting for the first validated EONET import.',
        'drought' => 'Waiting for the first validated EONET import.',
        'landslide' => 'Waiting for the first validated EONET import.',
        'volcano' => 'Waiting for the first validated EONET import.',
        'extreme_heat' => 'Location-level indicator only (computed from ERA5 on demand).',
        'air_quality' => 'Location-level indicator only (computed from CAMS on demand).',
    ],

    'referenceCities' => [
        ['name' => 'London', 'country' => 'United Kingdom', 'latitude' => 51.5074, 'longitude' => -0.1278],
        ['name' => 'New York', 'country' => 'United States', 'latitude' => 40.7128, 'longitude' => -74.006],
        ['name' => 'Singapore', 'country' => 'Singapore', 'latitude' => 1.3521, 'longitude' => 103.8198],
        ['name' => 'Cairo', 'country' => 'Egypt', 'latitude' => 30.0444, 'longitude' => 31.2357],
        ['name' => 'São Paulo', 'country' => 'Brazil', 'latitude' => -23.5505, 'longitude' => -46.6333],
        ['name' => 'Sydney', 'country' => 'Australia', 'latitude' => -33.8688, 'longitude' => 151.2093],
    ],

    'hazardTypes' => [
        'earthquake',
        'flood',
        'extreme_heat',
        'cyclone',
        'drought',
        'wildfire',
        'landslide',
        'air_quality',
        'volcano',
    ],
];
