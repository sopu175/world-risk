<?php

namespace common\models;

use yii\db\ActiveRecord;

/**
 * Ingestion runs — full audit trail for every import attempt.
 *
 * Table: ingestion_run (docs/schema-postgis.sql).
 *
 * @property int    $id
 * @property int    $source_id
 * @property string $status           running | success | partial | failed
 * @property string $trigger          manual | scheduled | bootstrap
 * @property int    $attempt
 * @property int    $records_fetched
 * @property int    $records_inserted
 * @property int    $records_updated
 * @property int    $records_skipped
 * @property int    $records_invalid
 * @property string|null $dataset_version
 * @property string|null $error_message
 * @property int|null $duration_ms
 * @property string $started_at
 * @property string|null $finished_at
 */
final class IngestionRun extends ActiveRecord
{
    public const STATUS_RUNNING = 'running';
    public const STATUS_SUCCESS = 'success';
    public const STATUS_PARTIAL = 'partial';
    public const STATUS_FAILED = 'failed';

    public const TRIGGER_MANUAL = 'manual';
    public const TRIGGER_SCHEDULED = 'scheduled';
    public const TRIGGER_BOOTSTRAP = 'bootstrap';

    public static function tableName(): string
    {
        return '{{%ingestion_run}}';
    }

    public function rules(): array
    {
        return [
            [['source_id', 'status', 'trigger'], 'required'],
            [['source_id'], 'integer', 'min' => 1],
            [['status'], 'in', 'range' => [
                self::STATUS_RUNNING,
                self::STATUS_SUCCESS,
                self::STATUS_PARTIAL,
                self::STATUS_FAILED,
            ]],
            [['trigger'], 'in', 'range' => [
                self::TRIGGER_MANUAL,
                self::TRIGGER_SCHEDULED,
                self::TRIGGER_BOOTSTRAP,
            ]],
            [['attempt', 'records_fetched', 'records_inserted', 'records_updated', 'records_skipped', 'records_invalid'], 'integer', 'min' => 0],
            [['duration_ms'], 'integer', 'min' => 0],
            [['dataset_version'], 'string', 'max' => 200],
            [['error_message'], 'string', 'max' => 2000],
        ];
    }

    public function attributeLabels(): array
    {
        return [
            'id' => 'ID',
            'source_id' => 'Source ID',
            'status' => 'Status',
            'trigger' => 'Trigger',
            'attempt' => 'Attempt',
            'records_fetched' => 'Records fetched',
            'records_inserted' => 'Records inserted',
            'records_updated' => 'Records updated',
            'records_skipped' => 'Records skipped',
            'records_invalid' => 'Records invalid',
            'dataset_version' => 'Dataset version',
            'error_message' => 'Error message',
            'duration_ms' => 'Duration (ms)',
            'started_at' => 'Started at',
            'finished_at' => 'Finished at',
        ];
    }
}
