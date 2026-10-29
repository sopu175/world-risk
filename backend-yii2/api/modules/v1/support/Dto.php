<?php

namespace api\modules\v1\support;

/**
 * Manual DTO mappers — the single place where snake_case database rows are
 * projected onto the exact camelCase JSON contract. Rows may come from
 * ActiveRecord::asArray() (raw PDO values: booleans as 't'/'f', bigints as
 * strings) or from yii\db\Query — every field is cast explicitly.
 */
final class Dto
{
    /**
     * ObservationDTO. $layerKey defaults to 'earthquake' — the only layer
     * currently stored as quantitative point observations.
     */
    public static function observation($row, string $layerKey = 'earthquake'): array
    {
        return [
            'id' => (int) self::field($row, 'id'),
            'externalId' => (string) self::field($row, 'external_id'),
            'layerKey' => $layerKey,
            'lat' => Format::num(self::field($row, 'lat')),
            'lng' => Format::num(self::field($row, 'lng')),
            'magnitude' => Format::num(self::field($row, 'magnitude')),
            'magnitudeType' => self::strOrNull(self::field($row, 'magnitude_type')),
            'depthKm' => Format::num(self::field($row, 'depth_km')),
            'value' => Format::num(self::field($row, 'value')),
            'unit' => self::strOrNull(self::field($row, 'unit')),
            'severityLabel' => self::strOrNull(self::field($row, 'severity_label')),
            'place' => self::strOrNull(self::field($row, 'place')),
            'countryCode' => self::strOrNull(self::field($row, 'country_code')),
            'occurredAt' => Format::isoFromDateTime(self::field($row, 'occurred_at')),
            'sourceUrl' => self::strOrNull(self::field($row, 'source_url')),
        ];
    }

    /** EventDTO. */
    public static function event($row): array
    {
        return [
            'id' => (int) self::field($row, 'id'),
            'externalId' => (string) self::field($row, 'external_id'),
            'title' => (string) self::field($row, 'title'),
            'eventType' => (string) self::field($row, 'event_type'),
            'kind' => (string) self::field($row, 'kind'),
            'lat' => Format::num(self::field($row, 'lat')),
            'lng' => Format::num(self::field($row, 'lng')),
            'placeName' => self::strOrNull(self::field($row, 'place_name')),
            'countryName' => self::strOrNull(self::field($row, 'country_name')),
            'countryCode' => self::strOrNull(self::field($row, 'country_code')),
            'startDate' => Format::isoFromDateTime(self::field($row, 'start_date')),
            'endDate' => Format::isoFromDateTime(self::field($row, 'end_date')),
            'severityLabel' => self::strOrNull(self::field($row, 'severity_label')),
            'severityValue' => Format::num(self::field($row, 'severity_value')),
            'severityUnit' => self::strOrNull(self::field($row, 'severity_unit')),
            'sourceName' => (string) self::field($row, 'source_name'),
            'sourceUrl' => self::strOrNull(self::field($row, 'source_url')),
            'sourcePublishedAt' => Format::isoFromDateTime(self::field($row, 'source_published_at')),
            'verificationStatus' => (string) self::field($row, 'verification_status'),
            'summary' => self::strOrNull(self::field($row, 'summary')),
        ];
    }

    /** IngestionRunDTO (row must include joined source_key / source_name). */
    public static function run($row): array
    {
        $duration = self::field($row, 'duration_ms');
        return [
            'id' => (int) self::field($row, 'id'),
            'sourceKey' => (string) self::field($row, 'source_key'),
            'sourceName' => (string) self::field($row, 'source_name'),
            'status' => (string) self::field($row, 'status'),
            'trigger' => (string) self::field($row, 'trigger'),
            'attempt' => (int) self::field($row, 'attempt'),
            'recordsFetched' => (int) self::field($row, 'records_fetched'),
            'recordsInserted' => (int) self::field($row, 'records_inserted'),
            'recordsUpdated' => (int) self::field($row, 'records_updated'),
            'recordsSkipped' => (int) self::field($row, 'records_skipped'),
            'recordsInvalid' => (int) self::field($row, 'records_invalid'),
            'datasetVersion' => self::strOrNull(self::field($row, 'dataset_version')),
            'errorMessage' => self::strOrNull(self::field($row, 'error_message')),
            'durationMs' => $duration === null ? null : (int) $duration,
            'startedAt' => Format::isoFromDateTime(self::field($row, 'started_at')),
            'finishedAt' => Format::isoFromDateTime(self::field($row, 'finished_at')),
        ];
    }

    /** DataSourceDTO. */
    public static function source($row, int $observationCount = 0, int $eventCount = 0): array
    {
        $lastSuccess = self::field($row, 'last_success_at');
        $lastAttempt = self::field($row, 'last_attempt_at');
        return [
            'key' => (string) self::field($row, 'key'),
            'name' => (string) self::field($row, 'name'),
            'provider' => (string) self::field($row, 'provider'),
            'homepageUrl' => (string) self::field($row, 'homepage_url'),
            'licenseName' => (string) self::field($row, 'license_name'),
            'licenseUrl' => (string) self::field($row, 'license_url'),
            'endpointUrl' => (string) self::field($row, 'endpoint_url'),
            'accessMode' => (string) self::field($row, 'access_mode'),
            'cadenceHours' => (int) self::field($row, 'cadence_hours'),
            'requiresApiKeyEnv' => self::strOrNull(self::field($row, 'requires_api_key_env')),
            'apiKeyPresent' => self::boolOf(self::field($row, 'api_key_present')),
            'enabled' => self::boolOf(self::field($row, 'enabled')),
            'status' => (string) self::field($row, 'status'),
            'statusReason' => self::strOrNull(self::field($row, 'status_reason')),
            'lastSuccessAt' => Format::isoFromDateTime($lastSuccess),
            'lastAttemptAt' => Format::isoFromDateTime($lastAttempt),
            'consecutiveFailures' => (int) self::field($row, 'consecutive_failures'),
            'notes' => self::strOrNull(self::field($row, 'notes')),
            'observationCount' => $observationCount,
            'eventCount' => $eventCount,
        ];
    }

    /** CorrectionDTO. */
    public static function correction($row): array
    {
        return [
            'id' => (int) self::field($row, 'id'),
            'targetType' => (string) self::field($row, 'target_type'),
            'targetId' => self::strOrNull(self::field($row, 'target_id')),
            'targetLabel' => self::strOrNull(self::field($row, 'target_label')),
            'field' => self::strOrNull(self::field($row, 'field')),
            'proposedValue' => self::strOrNull(self::field($row, 'proposed_value')),
            'message' => (string) self::field($row, 'message'),
            'submitterEmail' => self::strOrNull(self::field($row, 'submitter_email')),
            'status' => (string) self::field($row, 'status'),
            'adminNote' => self::strOrNull(self::field($row, 'admin_note')),
            'createdAt' => Format::isoFromDateTime(self::field($row, 'created_at')),
            'resolvedAt' => Format::isoFromDateTime(self::field($row, 'resolved_at')),
        ];
    }

    /** SavedLocationDTO. */
    public static function savedLocation($row): array
    {
        return [
            'id' => (int) self::field($row, 'id'),
            'sessionId' => (string) self::field($row, 'session_id'),
            'label' => (string) self::field($row, 'label'),
            'latitude' => Format::num(self::field($row, 'latitude')),
            'longitude' => Format::num(self::field($row, 'longitude')),
            'countryName' => self::strOrNull(self::field($row, 'country_name')),
            'note' => self::strOrNull(self::field($row, 'note')),
            'createdAt' => Format::isoFromDateTime(self::field($row, 'created_at')),
        ];
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private static function field($row, string $name)
    {
        if (is_array($row)) {
            return array_key_exists($name, $row) ? $row[$name] : null;
        }
        if (is_object($row)) {
            return $row->$name ?? null;
        }
        return null;
    }

    public static function strOrNull($value): ?string
    {
        if ($value === null) {
            return null;
        }
        if (is_string($value)) {
            return $value === '' ? null : $value;
        }
        return (string) $value;
    }

    /** PostgreSQL booleans arrive as 't'/'f' strings on raw rows. */
    public static function boolOf($value): bool
    {
        if (is_bool($value)) {
            return $value;
        }
        if (is_int($value)) {
            return $value !== 0;
        }
        if (is_string($value)) {
            $v = strtolower(trim($value));
            return $v === 't' || $v === 'true' || $v === '1' || $v === 'y' || $v === 'yes';
        }
        return (bool) $value;
    }
}
