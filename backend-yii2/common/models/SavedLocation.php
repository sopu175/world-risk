<?php

namespace common\models;

use yii\db\ActiveRecord;

/**
 * Saved locations — anonymous-session scope in the free tier MVP.
 * This is the monetization-ready extension point: premium tiers will attach
 * these to user accounts and add alert subscriptions.
 *
 * Table: saved_location (docs/schema-postgis.sql).
 *
 * @property int    $id
 * @property string $session_id
 * @property string $label
 * @property float  $latitude
 * @property float  $longitude
 * @property string|null $country_name
 * @property string|null $note
 * @property string $created_at
 */
final class SavedLocation extends ActiveRecord
{
    public static function tableName(): string
    {
        return '{{%saved_location}}';
    }

    public function rules(): array
    {
        return [
            [['session_id', 'label', 'latitude', 'longitude'], 'required'],
            [['session_id'], 'string', 'min' => 8, 'max' => 64],
            [['label'], 'string', 'min' => 1, 'max' => 120],
            [['latitude'], 'number', 'min' => -90, 'max' => 90],
            [['longitude'], 'number', 'min' => -180, 'max' => 180],
            [['country_name'], 'string', 'max' => 80],
            [['note'], 'string', 'max' => 300],
        ];
    }

    public function attributeLabels(): array
    {
        return [
            'id' => 'ID',
            'session_id' => 'Session ID',
            'label' => 'Label',
            'latitude' => 'Latitude',
            'longitude' => 'Longitude',
            'country_name' => 'Country name',
            'note' => 'Note',
            'created_at' => 'Created at',
        ];
    }
}
