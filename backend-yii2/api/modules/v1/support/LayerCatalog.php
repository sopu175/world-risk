<?php

namespace api\modules\v1\support;

/**
 * Static per-layer presentation metadata (mirrors src/lib/hazard-meta.ts in
 * the sandbox MVP): legends and the human reason shown when a layer has no
 * validated import yet. Layer rows themselves live in the hazard_layer table.
 */
final class LayerCatalog
{
    /** @var array<string, list<array{label:string,color:string,min?:float,max?:float}>> */
    public const LEGENDS = [
        'earthquake' => [
            ['label' => 'M 2.5 – 3.9', 'color' => '#fbbf24', 'min' => 2.5, 'max' => 4],
            ['label' => 'M 4.0 – 4.9', 'color' => '#f59e0b', 'min' => 4, 'max' => 5],
            ['label' => 'M 5.0 – 5.9', 'color' => '#d97706', 'min' => 5, 'max' => 6],
            ['label' => 'M 6.0 – 6.9', 'color' => '#c2410c', 'min' => 6, 'max' => 7],
            ['label' => 'M ≥ 7.0', 'color' => '#991b1b', 'min' => 7],
        ],
    ];

    /** @var array<string, string> reason shown when mapAvailable but no data */
    public const NO_DATA_REASONS = [
        'earthquake' => 'Waiting for the first validated import from the USGS feed.',
        'wildfire' => 'Waiting for the first validated EONET import.',
        'flood' => 'Waiting for the first validated EONET import.',
        'cyclone' => 'Waiting for the first validated EONET import.',
        'drought' => 'Waiting for the first validated EONET import.',
        'landslide' => 'Waiting for the first validated EONET import.',
        'volcano' => 'Waiting for the first validated EONET import.',
    ];

    /** @return list<array{label:string,color:string,min?:float,max?:float}>|null */
    public static function legend(string $layerKey): ?array
    {
        return self::LEGENDS[$layerKey] ?? null;
    }

    public static function noDataReason(string $layerKey): string
    {
        return self::NO_DATA_REASONS[$layerKey] ?? 'No validated data imported yet.';
    }
}
