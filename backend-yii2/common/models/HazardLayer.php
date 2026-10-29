<?php

namespace common\models;

use yii\db\ActiveRecord;

/**
 * Hazard layers — the extensible layer system shown in the map UI.
 *
 * A layer is only flagged available=true after a validated import exists
 * (set by the ingest adapters); availability is computed, never asserted.
 *
 * Table: hazard_layer (docs/schema-postgis.sql).
 *
 * @property int    $id
 * @property string $key
 * @property string $name
 * @property string $hazard_type
 * @property string $kind            observation | event | model | projection
 * @property string $description
 * @property string|null $units
 * @property string|null $methodology
 * @property string|null $resolution
 * @property string|null $temporal_coverage
 * @property string|null $license_name
 * @property string|null $license_url
 * @property string|null $limitations
 * @property string|null $source_key
 * @property string $color_hex
 * @property bool   $map_available
 * @property bool   $available
 * @property int    $sort_order
 * @property string $created_at
 * @property string $updated_at
 */
final class HazardLayer extends ActiveRecord
{
    public const KIND_OBSERVATION = 'observation';
    public const KIND_EVENT = 'event';
    public const KIND_MODEL = 'model';
    public const KIND_PROJECTION = 'projection';

    public static function tableName(): string
    {
        return '{{%hazard_layer}}';
    }

    public function rules(): array
    {
        return [
            [['key', 'name', 'hazard_type', 'kind', 'description'], 'required'],
            [['key'], 'string', 'max' => 100],
            [['key'], 'unique'],
            [['name'], 'string', 'max' => 200],
            [['hazard_type'], 'string', 'max' => 60],
            [['kind'], 'in', 'range' => [
                self::KIND_OBSERVATION,
                self::KIND_EVENT,
                self::KIND_MODEL,
                self::KIND_PROJECTION,
            ]],
            [['units', 'resolution', 'temporal_coverage'], 'string', 'max' => 300],
            [['methodology', 'limitations'], 'string', 'max' => 2000],
            [['license_name'], 'string', 'max' => 200],
            [['license_url'], 'string', 'max' => 500],
            [['source_key'], 'string', 'max' => 100],
            [['color_hex'], 'string', 'max' => 9],
            [['map_available', 'available'], 'boolean'],
            [['sort_order'], 'integer', 'min' => 0],
        ];
    }

    public function attributeLabels(): array
    {
        return [
            'id' => 'ID',
            'key' => 'Layer key',
            'name' => 'Name',
            'hazard_type' => 'Hazard type',
            'kind' => 'Kind',
            'description' => 'Description',
            'units' => 'Units',
            'methodology' => 'Methodology',
            'resolution' => 'Resolution',
            'temporal_coverage' => 'Temporal coverage',
            'license_name' => 'License name',
            'license_url' => 'License URL',
            'limitations' => 'Limitations',
            'source_key' => 'Source key',
            'color_hex' => 'Color',
            'map_available' => 'Map available',
            'available' => 'Available',
            'sort_order' => 'Sort order',
            'created_at' => 'Created at',
            'updated_at' => 'Updated at',
        ];
    }
}
