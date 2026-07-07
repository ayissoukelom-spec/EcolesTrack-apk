-- ====================================================================
-- ÉcoleTrack PostgreSQL Rollback Migration - 001_init_parental_app_rollback.sql
-- Description: Completely removes all tables in correct reverse topological order.
-- ====================================================================

DROP TABLE IF EXISTS app_notifications CASCADE;
DROP TABLE IF EXISTS notification_deliveries CASCADE;
DROP TABLE IF EXISTS notification_events CASCADE;
DROP TABLE IF EXISTS parent_consents CASCADE;
DROP TABLE IF EXISTS parent_notification_preferences CASCADE;
DROP TABLE IF EXISTS parent_devices CASCADE;
DROP TABLE IF EXISTS grades CASCADE;
DROP TABLE IF EXISTS absences CASCADE;
DROP TABLE IF EXISTS children CASCADE;
DROP TABLE IF EXISTS parent_schools CASCADE;
DROP TABLE IF EXISTS schools CASCADE;
DROP TABLE IF EXISTS parents CASCADE;

-- Optional: Drop UUID extension if not used elsewhere
-- DROP EXTENSION IF EXISTS "uuid-ossp";
