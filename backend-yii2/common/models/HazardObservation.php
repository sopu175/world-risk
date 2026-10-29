<?php

namespace common\models;

use yii\db\ActiveRecord;

/**
 * Hazard observations — quantitative point measurements (currently the USGS
 * earthquake feed is the only bulk-imported observation layer).
 *
 * Table: hazard_observation (docs/schema-postgis.sql). The PostGIS geometry
 * column `geom` is GENERATED ALWAYS AS ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
 * STORED — never written from PHP.
 *
 * Dedup key: UNIQUE (source_id, external_id).
 *
 * @property int    $id
 * @property int    $source_id
 * @property int    $layer_id
 * @property string $external_id
 * @property float  $lat
 * @property float  $lng
 * @property float|null $magnitude
 * @property string|null $magnitude_type
 * @property float|null $depth_km
 * @property float|null $value
 * @property string|null $unit
 * @property string|null $severity_label
 * @property string|null $place
 * @property string|null $country_code
 * @property string $occurred_at
 * @property string|null $source_url
 * @property string|null $raw_json
 * @property string $ingested_at
 */
final class HazardObservation extends ActiveRecord
{
    public static function tableName(): string
    {
        return '{{%hazard_observation}}';
    }

    public function rules(): array
    {
        return [
            [['source_id', 'layer_id', 'external_id', 'lat', 'lng', 'occurred_at'], 'required'],
            [['source_id', 'layer_id'], 'integer', 'min' => 1],
            [['external_id'], 'string', 'max' => 190],
            [['lat'], 'number', 'min' => -90, 'max' => 90],
            [['lng'], 'number', 'min' => -180, 'max' => 180],
            [['magnitude', 'depth_km', 'value'], 'number'],
            [['magnitude_type', 'unit', 'severity_label'], 'string', 'max' => 60],
            [['country_code'], 'string', 'max' => 8],
            [['place', 'source_url'], 'string', 'max' => 1000],
            [['raw_json'], 'string'],
        ];
    }

    public function attributeLabels(): array
    {
        return [
            'id' => 'ID',
            'source_id' => 'Source ID',
            'layer_id' => 'Layer ID',
            'external_id' => 'External ID',
            'lat' => 'Latitude',
            'lng' => 'Longitude',
            'magnitude' => 'Magnitude',
            'magnitude_type' => 'Magnitude type',
            'depth_km' => 'Depth (km)',
            'value' => 'Value',
            'unit' => 'Unit',
            'severity_label' => 'Severity label',
            'place' => 'Place',
            'country_code' => 'Country code',
            'occurred_at' => 'Occurred at',
            'source_url' => 'Source URL',
            'raw_json' => 'Raw payload',
            'ingested_at' => 'Ingested at',
        ];
    }
}
