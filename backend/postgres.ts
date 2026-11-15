import path from 'path';
import { existsSync } from 'fs';
import * as dotenv from 'dotenv';
import { Pool } from 'pg';

function loadEnvironment() {
  if (process.env.ECOLETRACK_RESTRICTED_DB_RUNTIME === 'true') {
    return null;
  }

  const candidates = process.env.NODE_ENV === 'production'
    ? [path.resolve(process.cwd(), '.env')]
    : [
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), '..', 'web ecoles', '.env'),
      path.resolve(process.cwd(), '..', 'web ecoles', '.env.local'),
    ];

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return candidate;
    }
  }

  return null;
}

loadEnvironment();

const sqlUser = process.env.SQL_USER?.trim();
const sqlPassword = process.env.SQL_PASSWORD;
const sqlDatabase = process.env.SQL_DB_NAME?.trim();
const requiresExplicitDatabaseConfig = process.env.NODE_ENV === 'production'
  || process.env.ECOLETRACK_RESTRICTED_DB_RUNTIME === 'true';
const sqlHost = process.env.SQL_HOST?.trim()
  || (requiresExplicitDatabaseConfig ? '' : '127.0.0.1');
const sqlPort = Number(process.env.SQL_PORT ?? 5432);

if (!sqlUser) {
  throw new Error('SQL_USER must be explicitly configured for the mobile API database connection.');
}
if (sqlPassword === undefined) {
  throw new Error('SQL_PASSWORD must be explicitly configured for the mobile API database connection.');
}
if (!sqlDatabase) {
  throw new Error('SQL_DB_NAME must be explicitly configured for the mobile API database connection.');
}
if (!sqlHost) {
  throw new Error('SQL_HOST must be explicitly configured for the mobile API database connection in production or restricted mode.');
}
if (requiresExplicitDatabaseConfig && process.env.SQL_PORT === undefined) {
  throw new Error('SQL_PORT must be explicitly configured for the mobile API database connection in production or restricted mode.');
}
if (!Number.isInteger(sqlPort) || sqlPort < 1 || sqlPort > 65535) {
  throw new Error('SQL_PORT must be an integer between 1 and 65535.');
}

const pool = new Pool({
  host: sqlHost,
  port: sqlPort,
  user: sqlUser,
  password: sqlPassword,
  database: sqlDatabase,
  ssl: process.env.SQL_SSL === 'true'
    ? { rejectUnauthorized: false }
    : undefined,
  connectionTimeoutMillis: 15000,
  max: 10,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

export async function verifyMobileTables() {
  const { rows } = await pool.query<{ item: string }>(`
    WITH required_tables(table_name) AS (
      VALUES
        ('users'),
        ('parents'),
        ('user_schools'),
        ('schools'),
        ('local_auths'),
        ('students'),
        ('classes'),
        ('levels'),
        ('cycles'),
        ('school_cycles'),
        ('absences'),
        ('teachers'),
        ('evaluations'),
        ('grades'),
        ('notifications'),
        ('subjects'),
        ('teacher_class_subjects'),
        ('notification_attachments'),
        ('late_arrivals'),
        ('late_arrival_justifications'),
        ('late_arrival_justification_files'),
        ('financial_obligations'),
        ('accounting_categories'),
        ('academic_years'),
        ('audit_events'),
        ('user_login_events'),
        ('teacher_control_audit_events'),
        ('mobile_parent_devices'),
        ('mobile_notification_preferences'),
        ('mobile_notification_consents'),
        ('mobile_notification_events'),
        ('mobile_notification_deliveries'),
        ('mobile_parent_sessions')
    ),
    required_columns(table_name, column_name) AS (
      VALUES
        ('users', 'id'),
        ('users', 'role'),
        ('users', 'is_deleted'),
        ('users', 'last_login_at'),
        ('users', 'last_mobile_visit_at'),
        ('parents', 'id'),
        ('parents', 'user_id'),
        ('parents', 'school_id'),
        ('parents', 'phone'),
        ('user_schools', 'user_id'),
        ('user_schools', 'school_id'),
        ('user_schools', 'role'),
        ('user_schools', 'is_active'),
        ('schools', 'id'),
        ('schools', 'name'),
        ('schools', 'address'),
        ('local_auths', 'user_id'),
        ('local_auths', 'password_hash'),
        ('local_auths', 'salt'),
        ('local_auths', 'must_reset'),
        ('students', 'id'),
        ('students', 'parent_id'),
        ('students', 'class_id'),
        ('students', 'first_name'),
        ('students', 'last_name'),
        ('students', 'birth_date'),
        ('students', 'photo_data'),
        ('students', 'photo_mime_type'),
        ('students', 'photo_updated_at'),
        ('classes', 'id'),
        ('classes', 'name'),
        ('classes', 'school_id'),
        ('classes', 'level_id'),
        ('levels', 'id'),
        ('levels', 'cycle_id'),
        ('levels', 'code'),
        ('levels', 'name'),
        ('cycles', 'id'),
        ('cycles', 'code'),
        ('cycles', 'name'),
        ('school_cycles', 'school_id'),
        ('school_cycles', 'cycle_id'),
        ('absences', 'id'),
        ('absences', 'student_id'),
        ('absences', 'class_id'),
        ('absences', 'date'),
        ('absences', 'period'),
        ('absences', 'is_justified'),
        ('absences', 'justification_reason'),
        ('absences', 'justification_status'),
        ('absences', 'subject_id'),
        ('teachers', 'id'),
        ('evaluations', 'id'),
        ('evaluations', 'class_id'),
        ('evaluations', 'teacher_id'),
        ('evaluations', 'subject'),
        ('evaluations', 'title'),
        ('evaluations', 'coefficient'),
        ('evaluations', 'max_score'),
        ('evaluations', 'count_in_bulletin'),
        ('evaluations', 'date'),
        ('evaluations', 'term_id'),
        ('grades', 'id'),
        ('grades', 'evaluation_id'),
        ('grades', 'student_id'),
        ('grades', 'score'),
        ('grades', 'remarks'),
        ('grades', 'edit_count'),
        ('grades', 'created_at'),
        ('grades', 'updated_at'),
        ('notifications', 'id'),
        ('notifications', 'user_id'),
        ('notifications', 'title'),
        ('notifications', 'body'),
        ('notifications', 'type'),
        ('notifications', 'is_read'),
        ('notifications', 'created_at'),
        ('subjects', 'id'),
        ('subjects', 'name'),
        ('teacher_class_subjects', 'id'),
        ('teacher_class_subjects', 'teacher_id'),
        ('teacher_class_subjects', 'subject_id'),
        ('teacher_class_subjects', 'school_id'),
        ('teacher_class_subjects', 'class_id'),
        ('notification_attachments', 'id'),
        ('notification_attachments', 'notification_id'),
        ('notification_attachments', 'file_name'),
        ('notification_attachments', 'mime_type'),
        ('notification_attachments', 'file_size'),
        ('notification_attachments', 'file_path'),
        ('late_arrivals', 'id'),
        ('late_arrivals', 'student_id'),
        ('late_arrivals', 'class_id'),
        ('late_arrivals', 'teaching_assignment_id'),
        ('late_arrival_justifications', 'id'),
        ('late_arrival_justifications', 'late_arrival_id'),
        ('late_arrival_justification_files', 'id'),
        ('late_arrival_justification_files', 'justification_id'),
        ('late_arrival_justification_files', 'file_name'),
        ('late_arrival_justification_files', 'file_path'),
        ('late_arrival_justification_files', 'mime_type'),
        ('late_arrival_justification_files', 'file_size'),
        ('late_arrival_justification_files', 'uploaded_by'),
        ('late_arrival_justification_files', 'uploaded_at'),
        ('financial_obligations', 'student_id'),
        ('financial_obligations', 'academic_year_id'),
        ('financial_obligations', 'category_id'),
        ('accounting_categories', 'id'),
        ('academic_years', 'id'),
        ('audit_events', 'id'),
        ('audit_events', 'action'),
        ('audit_events', 'resource_type'),
        ('audit_events', 'resource_id'),
        ('user_login_events', 'id'),
        ('user_login_events', 'user_id'),
        ('user_login_events', 'role'),
        ('user_login_events', 'school_id'),
        ('user_login_events', 'client_type'),
        ('user_login_events', 'login_at'),
        ('teacher_control_audit_events', 'id'),
        ('teacher_control_audit_events', 'school_id'),
        ('teacher_control_audit_events', 'school_name_snapshot'),
        ('teacher_control_audit_events', 'actor_user_id'),
        ('teacher_control_audit_events', 'actor_role'),
        ('teacher_control_audit_events', 'actor_email_snapshot'),
        ('teacher_control_audit_events', 'actor_name_snapshot'),
        ('teacher_control_audit_events', 'action'),
        ('teacher_control_audit_events', 'resource_type'),
        ('teacher_control_audit_events', 'resource_id'),
        ('teacher_control_audit_events', 'before_values'),
        ('teacher_control_audit_events', 'after_values'),
        ('teacher_control_audit_events', 'reason'),
        ('teacher_control_audit_events', 'created_at'),
        ('mobile_parent_devices', 'id'),
        ('mobile_parent_devices', 'parent_id'),
        ('mobile_parent_devices', 'device_id'),
        ('mobile_parent_devices', 'platform'),
        ('mobile_parent_devices', 'push_token'),
        ('mobile_parent_devices', 'app_version'),
        ('mobile_parent_devices', 'last_seen_at'),
        ('mobile_notification_preferences', 'parent_id'),
        ('mobile_notification_preferences', 'push_enabled'),
        ('mobile_notification_preferences', 'whatsapp_enabled'),
        ('mobile_notification_preferences', 'sms_enabled'),
        ('mobile_notification_preferences', 'quiet_hours_start'),
        ('mobile_notification_preferences', 'quiet_hours_end'),
        ('mobile_notification_consents', 'id'),
        ('mobile_notification_consents', 'parent_id'),
        ('mobile_notification_consents', 'channel'),
        ('mobile_notification_consents', 'consent_granted'),
        ('mobile_notification_consents', 'consent_text_version'),
        ('mobile_notification_consents', 'consented_at'),
        ('mobile_notification_consents', 'revoked_at'),
        ('mobile_notification_events', 'id'),
        ('mobile_notification_events', 'parent_id'),
        ('mobile_notification_events', 'event_type'),
        ('mobile_notification_events', 'payload_json'),
        ('mobile_notification_events', 'dedupe_key'),
        ('mobile_notification_events', 'created_at'),
        ('mobile_notification_deliveries', 'id'),
        ('mobile_notification_deliveries', 'event_id'),
        ('mobile_notification_deliveries', 'channel'),
        ('mobile_notification_deliveries', 'provider'),
        ('mobile_notification_deliveries', 'status'),
        ('mobile_notification_deliveries', 'attempts'),
        ('mobile_notification_deliveries', 'provider_message_id'),
        ('mobile_notification_deliveries', 'error_code'),
        ('mobile_notification_deliveries', 'error_message'),
        ('mobile_notification_deliveries', 'sent_at'),
        ('mobile_notification_deliveries', 'delivered_at'),
        ('mobile_parent_sessions', 'id'),
        ('mobile_parent_sessions', 'parent_id'),
        ('mobile_parent_sessions', 'role'),
        ('mobile_parent_sessions', 'refresh_token_hash'),
        ('mobile_parent_sessions', 'created_at'),
        ('mobile_parent_sessions', 'expires_at'),
        ('mobile_parent_sessions', 'is_active'),
        ('mobile_parent_sessions', 'revoked_at'),
        ('mobile_parent_sessions', 'last_used_at')
    ),
    required_indexes(table_name, index_name, is_unique) AS (
      VALUES
        ('mobile_parent_devices', 'mobile_parent_devices_device_idx', true),
        ('mobile_parent_devices', 'mobile_parent_devices_parent_platform_push_token_idx', false),
        ('mobile_parent_sessions', 'mobile_parent_sessions_parent_idx', false)
    ),
    required_unique_keys(table_name, key_columns) AS (
      VALUES
        ('mobile_parent_devices', ARRAY['id']::text[]),
        ('mobile_parent_devices', ARRAY['parent_id', 'platform', 'device_id']::text[]),
        ('mobile_notification_preferences', ARRAY['parent_id']::text[]),
        ('mobile_notification_consents', ARRAY['id']::text[]),
        ('mobile_notification_events', ARRAY['id']::text[]),
        ('mobile_notification_events', ARRAY['dedupe_key']::text[]),
        ('mobile_notification_deliveries', ARRAY['id']::text[]),
        ('mobile_parent_sessions', ARRAY['id']::text[]),
        ('mobile_parent_sessions', ARRAY['refresh_token_hash']::text[])
    ),
    required_identity_columns(table_name, column_name, generation) AS (
      VALUES
        ('mobile_parent_devices', 'id', 'ALWAYS'),
        ('mobile_notification_consents', 'id', 'ALWAYS'),
        ('mobile_notification_events', 'id', 'ALWAYS'),
        ('mobile_notification_deliveries', 'id', 'ALWAYS'),
        ('mobile_parent_sessions', 'id', 'ALWAYS')
    ),
    required_sequences(table_name, column_name) AS (
      VALUES
        ('user_login_events', 'id'),
        ('mobile_parent_devices', 'id'),
        ('mobile_notification_consents', 'id'),
        ('mobile_notification_events', 'id'),
        ('mobile_notification_deliveries', 'id'),
        ('mobile_parent_sessions', 'id')
    ),
    required_column_shapes(table_name, column_name, data_type, is_nullable) AS (
      VALUES
        ('users', 'id', 'integer', 'NO'),
        ('users', 'role', 'text', 'NO'),
        ('users', 'is_deleted', 'boolean', 'NO'),
        ('audit_events', 'id', 'integer', 'NO'),
        ('audit_events', 'action', 'text', 'NO'),
        ('audit_events', 'resource_type', 'text', 'NO'),
        ('audit_events', 'resource_id', 'integer', 'YES'),
        ('audit_events', 'occurred_at', 'timestamp with time zone', 'YES'),
        ('user_login_events', 'id', 'integer', 'NO'),
        ('user_login_events', 'user_id', 'integer', 'NO'),
        ('user_login_events', 'role', 'text', 'NO'),
        ('user_login_events', 'school_id', 'integer', 'YES'),
        ('user_login_events', 'client_type', 'text', 'YES'),
        ('user_login_events', 'login_at', 'timestamp without time zone', 'NO'),
        ('user_login_events', 'occurred_at', 'timestamp with time zone', 'YES'),
        ('teacher_control_audit_events', 'school_id', 'integer', 'NO'),
        ('teacher_control_audit_events', 'school_name_snapshot', 'text', 'NO'),
        ('teacher_control_audit_events', 'actor_user_id', 'integer', 'YES'),
        ('teacher_control_audit_events', 'actor_role', 'text', 'NO'),
        ('teacher_control_audit_events', 'actor_email_snapshot', 'text', 'YES'),
        ('teacher_control_audit_events', 'actor_name_snapshot', 'text', 'NO'),
        ('teacher_control_audit_events', 'action', 'text', 'NO'),
        ('teacher_control_audit_events', 'resource_type', 'text', 'NO'),
        ('teacher_control_audit_events', 'resource_id', 'integer', 'YES'),
        ('teacher_control_audit_events', 'before_values', 'jsonb', 'YES'),
        ('teacher_control_audit_events', 'after_values', 'jsonb', 'YES'),
        ('teacher_control_audit_events', 'reason', 'text', 'YES'),
        ('teacher_control_audit_events', 'created_at', 'timestamp with time zone', 'NO'),
        ('late_arrival_justification_files', 'id', 'integer', 'NO'),
        ('late_arrival_justification_files', 'justification_id', 'integer', 'NO'),
        ('late_arrival_justification_files', 'file_name', 'text', 'NO'),
        ('late_arrival_justification_files', 'file_path', 'text', 'NO'),
        ('late_arrival_justification_files', 'mime_type', 'text', 'NO'),
        ('late_arrival_justification_files', 'file_size', 'integer', 'NO'),
        ('late_arrival_justification_files', 'uploaded_by', 'integer', 'YES'),
        ('late_arrival_justification_files', 'uploaded_at', 'timestamp without time zone', 'NO'),
        ('mobile_parent_devices', 'id', 'integer', 'NO'),
        ('mobile_parent_devices', 'parent_id', 'text', 'NO'),
        ('mobile_parent_devices', 'device_id', 'text', 'YES'),
        ('mobile_parent_devices', 'platform', 'text', 'NO'),
        ('mobile_parent_devices', 'push_token', 'text', 'NO'),
        ('mobile_parent_devices', 'app_version', 'text', 'NO'),
        ('mobile_parent_devices', 'last_seen_at', 'timestamp without time zone', 'YES'),
        ('mobile_notification_preferences', 'parent_id', 'text', 'NO'),
        ('mobile_notification_preferences', 'push_enabled', 'boolean', 'NO'),
        ('mobile_notification_preferences', 'whatsapp_enabled', 'boolean', 'NO'),
        ('mobile_notification_preferences', 'sms_enabled', 'boolean', 'NO'),
        ('mobile_notification_preferences', 'quiet_hours_start', 'text', 'NO'),
        ('mobile_notification_preferences', 'quiet_hours_end', 'text', 'NO'),
        ('mobile_notification_consents', 'id', 'integer', 'NO'),
        ('mobile_notification_consents', 'parent_id', 'text', 'NO'),
        ('mobile_notification_consents', 'channel', 'text', 'NO'),
        ('mobile_notification_consents', 'consent_granted', 'boolean', 'NO'),
        ('mobile_notification_consents', 'consent_text_version', 'text', 'NO'),
        ('mobile_notification_consents', 'consented_at', 'timestamp without time zone', 'YES'),
        ('mobile_notification_consents', 'revoked_at', 'timestamp without time zone', 'YES'),
        ('mobile_notification_events', 'id', 'integer', 'NO'),
        ('mobile_notification_events', 'parent_id', 'text', 'NO'),
        ('mobile_notification_events', 'event_type', 'text', 'NO'),
        ('mobile_notification_events', 'payload_json', 'text', 'NO'),
        ('mobile_notification_events', 'dedupe_key', 'text', 'NO'),
        ('mobile_notification_events', 'created_at', 'timestamp without time zone', 'YES'),
        ('mobile_notification_deliveries', 'id', 'integer', 'NO'),
        ('mobile_notification_deliveries', 'event_id', 'integer', 'NO'),
        ('mobile_notification_deliveries', 'channel', 'text', 'NO'),
        ('mobile_notification_deliveries', 'provider', 'text', 'NO'),
        ('mobile_notification_deliveries', 'status', 'text', 'NO'),
        ('mobile_notification_deliveries', 'attempts', 'integer', 'NO'),
        ('mobile_notification_deliveries', 'provider_message_id', 'text', 'YES'),
        ('mobile_notification_deliveries', 'error_code', 'text', 'YES'),
        ('mobile_notification_deliveries', 'error_message', 'text', 'YES'),
        ('mobile_notification_deliveries', 'sent_at', 'timestamp without time zone', 'YES'),
        ('mobile_notification_deliveries', 'delivered_at', 'timestamp without time zone', 'YES'),
        ('mobile_parent_sessions', 'id', 'integer', 'NO'),
        ('mobile_parent_sessions', 'parent_id', 'text', 'NO'),
        ('mobile_parent_sessions', 'role', 'text', 'NO'),
        ('mobile_parent_sessions', 'refresh_token_hash', 'text', 'NO'),
        ('mobile_parent_sessions', 'created_at', 'timestamp with time zone', 'NO'),
        ('mobile_parent_sessions', 'expires_at', 'timestamp with time zone', 'NO'),
        ('mobile_parent_sessions', 'is_active', 'boolean', 'NO'),
        ('mobile_parent_sessions', 'revoked_at', 'timestamp with time zone', 'YES'),
        ('mobile_parent_sessions', 'last_used_at', 'timestamp with time zone', 'YES')
    ),
    required_defaults(table_name, column_name, expected_default) AS (
      VALUES
        ('audit_events', 'occurred_at', 'now()'),
        ('user_login_events', 'login_at', 'now()'),
        ('user_login_events', 'occurred_at', 'now()'),
        ('teacher_control_audit_events', 'created_at', 'now()'),
        ('late_arrival_justification_files', 'uploaded_at', 'now()'),
        ('mobile_parent_devices', 'last_seen_at', 'now()'),
        ('mobile_notification_preferences', 'push_enabled', 'true'),
        ('mobile_notification_preferences', 'whatsapp_enabled', 'false'),
        ('mobile_notification_preferences', 'sms_enabled', 'false'),
        ('mobile_notification_preferences', 'quiet_hours_start', '''22:00'''),
        ('mobile_notification_preferences', 'quiet_hours_end', '''07:00'''),
        ('mobile_notification_consents', 'consent_granted', 'false'),
        ('mobile_notification_consents', 'consent_text_version', '''v1.0-fr'''),
        ('mobile_notification_consents', 'consented_at', 'now()'),
        ('mobile_notification_events', 'created_at', 'now()'),
        ('mobile_notification_deliveries', 'attempts', '0'),
        ('mobile_parent_sessions', 'created_at', 'now()'),
        ('mobile_parent_sessions', 'is_active', 'true')
    ),
    required_append_only_triggers(table_name, trigger_name, trigger_type) AS (
      VALUES
        ('audit_events', 'audit_events_append_only_row', 27),
        ('audit_events', 'audit_events_append_only_truncate', 34),
        ('user_login_events', 'user_login_events_append_only_row', 27),
        ('user_login_events', 'user_login_events_append_only_truncate', 34),
        ('grade_history', 'grade_history_append_only_row', 27),
        ('grade_history', 'grade_history_append_only_truncate', 34)
    ),
    catalog_tables AS (
      SELECT relation.relname AS table_name
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace relation_schema
        ON relation_schema.oid = relation.relnamespace
      WHERE relation_schema.nspname = 'public'
        AND relation.relkind IN ('r', 'p')
    ),
    catalog_columns AS (
      SELECT
        relation.relname AS table_name,
        attribute.attname AS column_name,
        CASE column_type.typname
          WHEN 'bool' THEN 'boolean'
          WHEN 'int2' THEN 'smallint'
          WHEN 'int4' THEN 'integer'
          WHEN 'int8' THEN 'bigint'
          WHEN 'timestamp' THEN 'timestamp without time zone'
          WHEN 'timestamptz' THEN 'timestamp with time zone'
          ELSE pg_catalog.format_type(attribute.atttypid, NULL)
        END AS data_type,
        CASE WHEN attribute.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable,
        CASE attribute.attidentity
          WHEN 'a' THEN 'ALWAYS'
          WHEN 'd' THEN 'BY DEFAULT'
          ELSE NULL
        END AS identity_generation,
        pg_catalog.pg_get_expr(column_default.adbin, column_default.adrelid) AS column_default
      FROM pg_catalog.pg_attribute attribute
      JOIN pg_catalog.pg_class relation
        ON relation.oid = attribute.attrelid
      JOIN pg_catalog.pg_namespace relation_schema
        ON relation_schema.oid = relation.relnamespace
      JOIN pg_catalog.pg_type column_type
        ON column_type.oid = attribute.atttypid
      LEFT JOIN pg_catalog.pg_attrdef column_default
        ON column_default.adrelid = relation.oid
       AND column_default.adnum = attribute.attnum
      WHERE relation_schema.nspname = 'public'
        AND relation.relkind IN ('r', 'p')
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    ),
    missing AS (
      SELECT 'table public.' || expected.table_name AS item
      FROM required_tables expected
      LEFT JOIN catalog_tables actual
        ON actual.table_name = expected.table_name
      WHERE actual.table_name IS NULL

      UNION ALL

      SELECT 'column public.' || expected.table_name || '.' || expected.column_name
      FROM required_columns expected
      LEFT JOIN catalog_columns actual
        ON actual.table_name = expected.table_name
       AND actual.column_name = expected.column_name
      WHERE actual.column_name IS NULL

      UNION ALL

      SELECT 'column type/nullability public.' || expected.table_name || '.' || expected.column_name
      FROM required_column_shapes expected
      LEFT JOIN catalog_columns actual
        ON actual.table_name = expected.table_name
       AND actual.column_name = expected.column_name
      WHERE actual.column_name IS NULL
         OR actual.data_type IS DISTINCT FROM expected.data_type
         OR actual.is_nullable IS DISTINCT FROM expected.is_nullable

      UNION ALL

      SELECT 'column default public.' || expected.table_name || '.' || expected.column_name
      FROM required_defaults expected
      LEFT JOIN catalog_columns actual
        ON actual.table_name = expected.table_name
       AND actual.column_name = expected.column_name
      WHERE replace(actual.column_default, '::text', '') IS DISTINCT FROM expected.expected_default

      UNION ALL

      SELECT 'function public.reject_audit_history_mutation()' AS item
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_proc protected_function
        JOIN pg_language function_language ON function_language.oid = protected_function.prolang
        WHERE protected_function.oid = to_regprocedure('public.reject_audit_history_mutation()')
          AND function_language.lanname = 'plpgsql'
          AND NOT protected_function.prosecdef
          AND protected_function.prosrc ILIKE '%RAISE EXCEPTION%'
          AND protected_function.prosrc ILIKE '%append-only%'
      )

      UNION ALL

      SELECT 'append-only trigger public.' || expected.table_name || '.' || expected.trigger_name
      FROM required_append_only_triggers expected
      WHERE (expected.table_name <> 'grade_history'
             OR to_regclass('public.grade_history') IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1
          FROM pg_trigger trigger_object
          WHERE trigger_object.tgrelid = to_regclass('public.' || expected.table_name)
            AND trigger_object.tgname = expected.trigger_name
            AND trigger_object.tgtype = expected.trigger_type
            AND trigger_object.tgenabled = 'A'
            AND trigger_object.tgfoid = to_regprocedure('public.reject_audit_history_mutation()')
            AND NOT trigger_object.tgisinternal
        )

      UNION ALL

      SELECT 'Teacher Control trigger public.' || expected.trigger_name
      FROM (VALUES
        ('teacher_control_audit_events_append_only', 27),
        ('teacher_control_audit_events_no_truncate', 34)
      ) AS expected(trigger_name, trigger_type)
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_trigger trigger_object
        WHERE trigger_object.tgrelid = to_regclass('public.teacher_control_audit_events')
          AND trigger_object.tgname = expected.trigger_name
          AND trigger_object.tgtype = expected.trigger_type
          AND trigger_object.tgenabled = 'A'
          AND trigger_object.tgfoid = to_regprocedure('public.prevent_teacher_control_history_mutation()')
          AND NOT trigger_object.tgisinternal
      )

      UNION ALL

      SELECT 'function public.prevent_teacher_control_history_mutation()'
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_proc protected_function
        JOIN pg_language function_language ON function_language.oid = protected_function.prolang
        WHERE protected_function.oid = to_regprocedure('public.prevent_teacher_control_history_mutation()')
          AND function_language.lanname = 'plpgsql'
          AND NOT protected_function.prosecdef
          AND protected_function.prosrc ILIKE '%RAISE EXCEPTION%'
          AND protected_function.prosrc ILIKE '%append-only%'
      )

      UNION ALL

      SELECT 'runtime role lacks USAGE on public'
      WHERE NOT has_schema_privilege(current_user, 'public', 'USAGE')

      UNION ALL

      SELECT 'runtime role must not have CREATE on public'
      WHERE has_schema_privilege(current_user, 'public', 'CREATE')

      UNION ALL

      SELECT 'runtime role has administrative attributes'
      WHERE EXISTS (
        SELECT 1
        FROM pg_roles elevated_role
        WHERE (elevated_role.rolsuper OR elevated_role.rolcreatedb OR elevated_role.rolcreaterole)
          AND pg_has_role(current_user, elevated_role.oid, 'MEMBER')
      )

      UNION ALL

      SELECT 'runtime role owns or inherits ownership of public objects'
      WHERE EXISTS (
        SELECT 1
        FROM pg_class owned_object
        JOIN pg_namespace object_schema ON object_schema.oid = owned_object.relnamespace
        WHERE object_schema.nspname = 'public'
          AND owned_object.relkind IN ('r', 'p', 'S', 'v', 'm')
          AND pg_has_role(current_user, owned_object.relowner, 'MEMBER')
      )

      UNION ALL

      SELECT 'runtime role can mutate append-only journal public.' || expected.table_name
      FROM (VALUES
        ('audit_events'),
        ('user_login_events'),
        ('teacher_control_audit_events'),
        ('grade_history')
      ) AS expected(table_name)
      WHERE (expected.table_name <> 'grade_history'
             OR to_regclass('public.grade_history') IS NOT NULL)
        AND (
          has_table_privilege(current_user, 'public.' || expected.table_name, 'UPDATE')
          OR has_any_column_privilege(current_user, 'public.' || expected.table_name, 'UPDATE')
          OR has_table_privilege(current_user, 'public.' || expected.table_name, 'DELETE')
          OR has_table_privilege(current_user, 'public.' || expected.table_name, 'TRUNCATE')
        )

      UNION ALL

      SELECT 'targeted destructive journal foreign keys'
      WHERE EXISTS (
        SELECT 1
        FROM pg_constraint constraint_object
        JOIN pg_class child ON child.oid = constraint_object.conrelid
        JOIN pg_namespace child_schema ON child_schema.oid = child.relnamespace
        JOIN pg_class parent ON parent.oid = constraint_object.confrelid
        JOIN pg_namespace parent_schema ON parent_schema.oid = parent.relnamespace
        JOIN pg_attribute child_column
          ON child_column.attrelid = constraint_object.conrelid
         AND child_column.attnum = constraint_object.conkey[1]
        JOIN pg_attribute parent_column
          ON parent_column.attrelid = constraint_object.confrelid
         AND parent_column.attnum = constraint_object.confkey[1]
        WHERE constraint_object.contype = 'f'
          AND array_length(constraint_object.conkey, 1) = 1
          AND array_length(constraint_object.confkey, 1) = 1
          AND child_schema.nspname = 'public'
          AND parent_schema.nspname = 'public'
          AND (
            (child.relname = 'audit_events' AND child_column.attname = 'actor_user_id'
              AND parent.relname = 'users' AND parent_column.attname = 'id')
            OR (child.relname = 'audit_events' AND child_column.attname = 'school_id'
              AND parent.relname = 'schools' AND parent_column.attname = 'id')
            OR (child.relname = 'user_login_events' AND child_column.attname = 'user_id'
              AND parent.relname = 'users' AND parent_column.attname = 'id')
            OR (child.relname = 'user_login_events' AND child_column.attname = 'school_id'
              AND parent.relname = 'schools' AND parent_column.attname = 'id')
            OR (child.relname = 'grade_history' AND child_column.attname = 'grade_id'
              AND parent.relname = 'grades' AND parent_column.attname = 'id')
            OR (child.relname = 'grade_history' AND child_column.attname = 'changed_by'
              AND parent.relname = 'users' AND parent_column.attname = 'id')
          )
      )

      UNION ALL

      SELECT 'index public.' || expected.index_name
      FROM required_indexes expected
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_class index_object
        JOIN pg_namespace index_schema ON index_schema.oid = index_object.relnamespace
        JOIN pg_index index_definition ON index_definition.indexrelid = index_object.oid
        JOIN pg_class indexed_table ON indexed_table.oid = index_definition.indrelid
        JOIN pg_namespace table_schema ON table_schema.oid = indexed_table.relnamespace
        WHERE index_schema.nspname = 'public'
          AND index_object.relname = expected.index_name
          AND index_object.relkind = 'i'
          AND table_schema.nspname = 'public'
          AND indexed_table.relname = expected.table_name
          AND index_definition.indisvalid
          AND index_definition.indisready
          AND index_definition.indisunique = expected.is_unique
      )

      UNION ALL

      SELECT 'unique key public.' || expected.table_name || '(' ||
             array_to_string(expected.key_columns, ',') || ')'
      FROM required_unique_keys expected
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_index index_definition
        JOIN pg_class indexed_table ON indexed_table.oid = index_definition.indrelid
        JOIN pg_namespace indexed_schema ON indexed_schema.oid = indexed_table.relnamespace
        WHERE indexed_schema.nspname = 'public'
          AND indexed_table.relname = expected.table_name
          AND index_definition.indisunique
          AND index_definition.indisvalid
          AND index_definition.indisready
          AND index_definition.indpred IS NULL
          AND ARRAY(
            SELECT attribute.attname::text
            FROM unnest(index_definition.indkey) WITH ORDINALITY AS key_column(attnum, ordinal)
            JOIN pg_attribute attribute
              ON attribute.attrelid = index_definition.indrelid
             AND attribute.attnum = key_column.attnum
            WHERE key_column.ordinal <= index_definition.indnkeyatts
            ORDER BY key_column.ordinal
          ) = expected.key_columns
      )

      UNION ALL

      SELECT 'identity column public.' || expected.table_name || '.' || expected.column_name
      FROM required_identity_columns expected
      LEFT JOIN catalog_columns actual
        ON actual.table_name = expected.table_name
       AND actual.column_name = expected.column_name
       AND actual.identity_generation = expected.generation
      WHERE actual.column_name IS NULL

      UNION ALL

      SELECT 'sequence for public.' || expected.table_name || '.' || expected.column_name
      FROM required_sequences expected
      WHERE pg_get_serial_sequence(
       'public.' || expected.table_name,
       expected.column_name
      ) IS NULL
    )
    SELECT item FROM missing ORDER BY item
  `);

  if (rows.length > 0) {
    const missingItems = rows.map((row) => row.item);
    throw new Error(
      `Restricted mobile API runtime cannot start; required schema is missing or incompatible: ${missingItems.join(', ')}`,
    );
  }
}

export async function initializeMobileTables() {
  // Clean up potential orphan sequences created by previous SERIAL-based table creations
  // This only drops the orphan sequence when the table itself does not exist to avoid data loss.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'r' AND relname = 'mobile_parent_devices')
         AND EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'mobile_parent_devices_id_seq') THEN
        DROP SEQUENCE IF EXISTS mobile_parent_devices_id_seq;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'r' AND relname = 'mobile_notification_consents')
         AND EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'mobile_notification_consents_id_seq') THEN
        DROP SEQUENCE IF EXISTS mobile_notification_consents_id_seq;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'r' AND relname = 'mobile_notification_events')
         AND EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'mobile_notification_events_id_seq') THEN
        DROP SEQUENCE IF EXISTS mobile_notification_events_id_seq;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'r' AND relname = 'mobile_notification_deliveries')
         AND EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'mobile_notification_deliveries_id_seq') THEN
        DROP SEQUENCE IF EXISTS mobile_notification_deliveries_id_seq;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'r' AND relname = 'mobile_parent_sessions')
         AND EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'mobile_parent_sessions_id_seq') THEN
        DROP SEQUENCE IF EXISTS mobile_parent_sessions_id_seq;
      END IF;
    END
    $$;
  `);

  // Create tables using IDENTITY columns (modern PostgreSQL) to avoid creating explicit sequences
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mobile_parent_devices (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      parent_id TEXT NOT NULL,
      device_id TEXT,
      platform TEXT NOT NULL,
      push_token TEXT NOT NULL,
      app_version TEXT NOT NULL,
      last_seen_at TIMESTAMP DEFAULT now()
    );
    ALTER TABLE mobile_parent_devices ADD COLUMN IF NOT EXISTS device_id TEXT;
    DROP INDEX IF EXISTS mobile_parent_devices_unique_idx;
    CREATE UNIQUE INDEX IF NOT EXISTS mobile_parent_devices_device_idx ON mobile_parent_devices (parent_id, platform, device_id);
    CREATE INDEX IF NOT EXISTS mobile_parent_devices_parent_platform_push_token_idx ON mobile_parent_devices (parent_id, platform, push_token);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mobile_notification_preferences (
      parent_id TEXT PRIMARY KEY,
      push_enabled BOOLEAN NOT NULL DEFAULT true,
      whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
      sms_enabled BOOLEAN NOT NULL DEFAULT false,
      quiet_hours_start TEXT NOT NULL DEFAULT '22:00',
      quiet_hours_end TEXT NOT NULL DEFAULT '07:00'
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mobile_notification_consents (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      parent_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      consent_granted BOOLEAN NOT NULL DEFAULT false,
      consent_text_version TEXT NOT NULL DEFAULT 'v1.0-fr',
      consented_at TIMESTAMP DEFAULT now(),
      revoked_at TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mobile_notification_events (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      parent_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mobile_notification_deliveries (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      event_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      provider_message_id TEXT,
      error_code TEXT,
      error_message TEXT,
      sent_at TIMESTAMP,
      delivered_at TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mobile_parent_sessions (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      parent_id TEXT NOT NULL,
      role TEXT NOT NULL,
      refresh_token_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      revoked_at TIMESTAMP WITH TIME ZONE,
      last_used_at TIMESTAMP WITH TIME ZONE
    );
    CREATE INDEX IF NOT EXISTS mobile_parent_sessions_parent_idx ON mobile_parent_sessions(parent_id);
  `);
}

export async function dbQuery<T = any>(text: string, params: any[] = []) {
  const result = await pool.query(text, params);
  return result as { rows: T[]; rowCount: number };
}

export { pool };
