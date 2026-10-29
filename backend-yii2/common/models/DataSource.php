<?php

namespace common\models;

use Yii;
use yii\db\ActiveRecord;

/**
 * Data source registry — every row of data in the atlas must trace back here.
 *
 * Table: data_source (docs/schema-postgis.sql).
 * Column names are snake_case and map 1:1 to attributes; DTO mapping to the
 * camelCase API contract happens manually in api/modules/v1/support/Dto.php.
 *
 * status: active | needs_config | disabled | auto_disabled | failed
 * access_mode: bulk | on_demand
 *
 * @property int    $id
 * @property string $key
 * @property string $name
 * @property string $provider
 * @property string $homepage_url
 * @property string $license_name
 * @property string $license_url
 * @property string $endpoint_url
 * @property string $access_mode
 * @property int    $cadence_hours
 * @property string|null $requires_api_key_env
 * @property bool   $api_key_present
 * @property bool   $enabled
 * @property string $status
 * @property string|null $status_reason
 * @property string|null $last_success_at
 * @property string|null $last_attempt_at
 * @property int    $consecutive_failures
 * @property string|null $notes
 * @property string $created_at
 * @property string $updated_at
 */
final class DataSource extends ActiveRecord
{
    public const STATUS_ACTIVE = 'active';
    public const STATUS_NEEDS_CONFIG = 'needs_config';
    public const STATUS_DISABLED = 'disabled';
    public const STATUS_AUTO_DISABLED = 'auto_disabled';
    public const STATUS_FAILED = 'failed';

    public const ACCESS_BULK = 'bulk';
    public const ACCESS_ON_DEMAND = 'on_demand';

    public static function tableName(): string
    {
        return '{{%data_source}}';
    }

    public function rules(): array
    {
        return [
            [['key', 'name', 'provider', 'homepage_url', 'license_name', 'license_url', 'endpoint_url'], 'required'],
            [['key'], 'string', 'max' => 100],
            [['key'], 'unique'],
            [['access_mode'], 'in', 'range' => [self::ACCESS_BULK, self::ACCESS_ON_DEMAND]],
            [['status'], 'in', 'range' => [
                self::STATUS_ACTIVE,
                self::STATUS_NEEDS_CONFIG,
                self::STATUS_DISABLED,
                self::STATUS_AUTO_DISABLED,
                self::STATUS_FAILED,
            ]],
            [['cadence_hours'], 'integer', 'min' => 0],
            [['consecutive_failures'], 'integer', 'min' => 0],
            [['requires_api_key_env'], 'string', 'max' => 100],
            [['api_key_present', 'enabled'], 'boolean'],
            [['name', 'provider'], 'string', 'max' => 200],
            [['homepage_url', 'license_name', 'license_url', 'endpoint_url', 'status_reason', 'notes'], 'string', 'max' => 1000],
        ];
    }

    public function attributeLabels(): array
    {
        return [
            'id' => 'ID',
            'key' => 'Source key',
            'name' => 'Name',
            'provider' => 'Provider',
            'homepage_url' => 'Homepage URL',
            'license_name' => 'License name',
            'license_url' => 'License URL',
            'endpoint_url' => 'Endpoint URL',
            'access_mode' => 'Access mode',
            'cadence_hours' => 'Cadence (hours)',
            'requires_api_key_env' => 'Required API key environment variable',
            'api_key_present' => 'API key present',
            'enabled' => 'Enabled',
            'status' => 'Status',
            'status_reason' => 'Status reason',
            'last_success_at' => 'Last success at',
            'last_attempt_at' => 'Last attempt at',
            'consecutive_failures' => 'Consecutive failures',
            'notes' => 'Notes',
            'created_at' => 'Created at',
            'updated_at' => 'Updated at',
        ];
    }
}
