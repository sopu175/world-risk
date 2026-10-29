<?php

namespace common\models;

use yii\db\ActiveRecord;

/**
 * User-submitted corrections.
 *
 * Table: correction (docs/schema-postgis.sql).
 *
 * @property int    $id
 * @property string $target_type      event | observation | location
 * @property string|null $target_id
 * @property string|null $target_label
 * @property string|null $field
 * @property string|null $proposed_value
 * @property string $message
 * @property string|null $submitter_email
 * @property string $status           open | resolved | rejected
 * @property string|null $admin_note
 * @property string $created_at
 * @property string|null $resolved_at
 */
final class Correction extends ActiveRecord
{
    public const STATUS_OPEN = 'open';
    public const STATUS_RESOLVED = 'resolved';
    public const STATUS_REJECTED = 'rejected';

    public const TARGET_EVENT = 'event';
    public const TARGET_OBSERVATION = 'observation';
    public const TARGET_LOCATION = 'location';

    public static function tableName(): string
    {
        return '{{%correction}}';
    }

    public function rules(): array
    {
        return [
            [['target_type', 'message'], 'required'],
            [['target_type'], 'in', 'range' => [
                self::TARGET_EVENT,
                self::TARGET_OBSERVATION,
                self::TARGET_LOCATION,
            ]],
            [['target_id'], 'string', 'max' => 64],
            [['target_label'], 'string', 'max' => 160],
            [['field'], 'string', 'max' => 60],
            [['proposed_value'], 'string', 'max' => 500],
            [['message'], 'string', 'min' => 10, 'max' => 2000],
            [['submitter_email'], 'email'],
            [['submitter_email'], 'string', 'max' => 160],
            [['status'], 'in', 'range' => [
                self::STATUS_OPEN,
                self::STATUS_RESOLVED,
                self::STATUS_REJECTED,
            ]],
            [['admin_note'], 'string', 'max' => 500],
        ];
    }

    public function attributeLabels(): array
    {
        return [
            'id' => 'ID',
            'target_type' => 'Target type',
            'target_id' => 'Target ID',
            'target_label' => 'Target label',
            'field' => 'Field',
            'proposed_value' => 'Proposed value',
            'message' => 'Message',
            'submitter_email' => 'Submitter email',
            'status' => 'Status',
            'admin_note' => 'Admin note',
            'created_at' => 'Created at',
            'resolved_at' => 'Resolved at',
        ];
    }
}
