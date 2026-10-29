<?php

namespace common\models;

use yii\db\ActiveRecord;

/**
 * Disaster events — documented events (deliberately separate from quantitative
 * observations). kind distinguishes historical | active | model | projection.
 *
 * Table: disaster_event (docs/schema-postgis.sql). The PostGIS geometry column
 * `geom` is GENERATED ALWAYS AS ... STORED from lat/lng and is NULL when
 * lat or lng is NULL — never written from PHP.
 *
 * Dedup key: UNIQUE (source_id, external_id).
 *
 * @property int    $id
 * @property int    $source_id
 * @property string $external_id
 * @property string $title
 * @property string $event_type
 * @property string $kind
 * @property float|null $lat
 * @property float|null $lng
 * @property string|null $place_name
 * @property string|null $country_name
 * @property string|null $country_code
 * @property string|null $start_date
 * @property string|null $end_date
 * @property string|null $severity_label
 * @property float|null $severity_value
 * @property string|null $severity_unit
 * @property int|null $affected_count
 * @property string $source_name
 * @property string|null $source_url
 * @property string|null $source_published_at
 * @property string $verification_status
 * @property string|null $summary
 * @property string $ingested_at
 * @property string $updated_at
 */
final class DisasterEvent extends ActiveRecord
{
    public const KIND_HISTORICAL = 'historical';
    public const KIND_ACTIVE = 'active';
    public const KIND_MODEL = 'model';
    public const KIND_PROJECTION = 'projection';

    public const VERIFICATION_SOURCE_REPORTED = 'source_reported';
    public const VERIFICATION_CROSS_VERIFIED = 'cross_verified';
    public const VERIFICATION_UNVERIFIED = 'unverified';

    public static function tableName(): string
    {
        return '{{%disaster_event}}';
    }

    public function rules(): array
    {
        return [
            [['source_id', 'external_id', 'title', 'event_type', 'source_name'], 'required'],
            [['source_id'], 'integer', 'min' => 1],
            [['external_id'], 'string', 'max' => 190],
            [['title'], 'string', 'max' => 300],
            [['event_type'], 'in', 'range' => [
                'earthquake', 'flood', 'extreme_heat', 'cyclone', 'drought',
                'wildfire', 'landslide', 'air_quality', 'volcano', 'other',
            ]],
            [['kind'], 'in', 'range' => [
                self::KIND_HISTORICAL,
                self::KIND_ACTIVE,
                self::KIND_MODEL,
                self::KIND_PROJECTION,
            ]],
            [['verification_status'], 'in', 'range' => [
                self::VERIFICATION_SOURCE_REPORTED,
                self::VERIFICATION_CROSS_VERIFIED,
                self::VERIFICATION_UNVERIFIED,
            ]],
            // Nullable coordinates: the number validator skips empty values.
            [['lat'], 'number', 'min' => -90, 'max' => 90],
            [['lng'], 'number', 'min' => -180, 'max' => 180],
            [['place_name', 'country_name'], 'string', 'max' => 200],
            [['country_code'], 'string', 'max' => 8],
            [['severity_label'], 'string', 'max' => 120],
            [['severity_value'], 'number'],
            [['severity_unit'], 'string', 'max' => 60],
            [['affected_count'], 'integer', 'min' => 0],
            [['source_name'], 'string', 'max' => 200],
            [['source_url'], 'string', 'max' => 500],
            [['summary'], 'string', 'max' => 1000],
        ];
    }

    public function attributeLabels(): array
    {
        return [
            'id' => 'ID',
            'source_id' => 'Source ID',
            'external_id' => 'External ID',
            'title' => 'Title',
            'event_type' => 'Event type',
            'kind' => 'Kind',
            'lat' => 'Latitude',
            'lng' => 'Longitude',
            'place_name' => 'Place name',
            'country_name' => 'Country name',
            'country_code' => 'Country code',
            'start_date' => 'Start date',
            'end_date' => 'End date',
            'severity_label' => 'Severity label',
            'severity_value' => 'Severity value',
            'severity_unit' => 'Severity unit',
            'affected_count' => 'Affected count',
            'source_name' => 'Source name',
            'source_url' => 'Source URL',
            'source_published_at' => 'Source published at',
            'verification_status' => 'Verification status',
            'summary' => 'Summary',
            'ingested_at' => 'Ingested at',
            'updated_at' => 'Updated at',
        ];
    }
}
