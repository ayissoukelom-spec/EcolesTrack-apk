-- ====================================================================
-- ÉcoleTrack PostgreSQL Migration - 002_fix_mobile_parent_devices_indexes.sql
-- Description: Remove inconsistent unique index on (parent_id, platform, push_token)
-- and keep unique device identity for mobile parent device push token registration.
-- ====================================================================

BEGIN;

DROP INDEX IF EXISTS mobile_parent_devices_unique_idx;
DROP INDEX IF EXISTS mobile_parent_devices_device_idx;

CREATE UNIQUE INDEX IF NOT EXISTS mobile_parent_devices_device_idx
  ON mobile_parent_devices (parent_id, platform, device_id);

CREATE INDEX IF NOT EXISTS mobile_parent_devices_parent_platform_push_token_idx
  ON mobile_parent_devices (parent_id, platform, push_token);

COMMIT;
