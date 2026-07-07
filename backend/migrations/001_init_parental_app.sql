-- ====================================================================
-- ÉcoleTrack PostgreSQL Migration - 001_init_parental_app.sql
-- Description: Complete schema for parental portal and multi-channel notification engine.
-- Performance indices are configured to prevent slow queries on main feeds.
-- ====================================================================

-- 1. EXTENSIONS (Useful for uuid-ossp if UUIDs are used)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. PARENTS & SCHOOLS RELATIONSHIP (For contextual info)
CREATE TABLE IF NOT EXISTS parents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    active_school_id UUID NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS parent_schools (
    parent_id UUID REFERENCES parents(id) ON DELETE CASCADE,
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    PRIMARY KEY (parent_id, school_id)
);

-- 3. CHILDREN & STUDENTS
CREATE TABLE IF NOT EXISTS children (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    class_name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(512),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. ABSENCES (Absences per child)
CREATE TABLE IF NOT EXISTS absences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    reason VARCHAR(512) NOT NULL,
    justified BOOLEAN DEFAULT FALSE,
    justification_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. GRADES & EVALUATIONS
CREATE TABLE IF NOT EXISTS grades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    subject VARCHAR(100) NOT NULL,
    grade NUMERIC(4, 2) NOT NULL CHECK (grade >= 0.00 AND grade <= 20.00),
    coefficient NUMERIC(3, 1) DEFAULT 1.0,
    exam_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. PARENT DEVICES (For Push Notifications tokens registration)
CREATE TABLE IF NOT EXISTS parent_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('android', 'ios')),
    push_token VARCHAR(512) NOT NULL,
    app_version VARCHAR(50) NOT NULL,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. PARENT NOTIFICATION PREFERENCES
CREATE TABLE IF NOT EXISTS parent_notification_preferences (
    parent_id UUID PRIMARY KEY REFERENCES parents(id) ON DELETE CASCADE,
    push_enabled BOOLEAN DEFAULT TRUE,
    whatsapp_enabled BOOLEAN DEFAULT FALSE,
    sms_enabled BOOLEAN DEFAULT FALSE,
    quiet_hours_start TIME WITHOUT TIME ZONE DEFAULT '22:00',
    quiet_hours_end TIME WITHOUT TIME ZONE DEFAULT '07:00',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. PARENT CONSENT CENTER
CREATE TABLE IF NOT EXISTS parent_consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('whatsapp', 'sms')),
    consent_granted BOOLEAN NOT NULL DEFAULT FALSE,
    consent_text_version VARCHAR(50) NOT NULL,
    consented_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE
);

-- 9. NOTIFICATION EVENTS (Auditing & deduplication)
CREATE TABLE IF NOT EXISTS notification_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    payload_json JSONB NOT NULL,
    dedupe_key VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. NOTIFICATION DELIVERIES (Tracking delivery status across multi-channels)
CREATE TABLE IF NOT EXISTS notification_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES notification_events(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('push', 'whatsapp', 'sms')),
    provider VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
    attempts INT DEFAULT 0,
    provider_message_id VARCHAR(255),
    error_code VARCHAR(100),
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE
);

-- 11. IN-APP NOTIFICATIONS FEED
CREATE TABLE IF NOT EXISTS app_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deep_link VARCHAR(255)
);

-- ====================================================================
-- INDEX OPTIMIZATIONS (To guarantee scalability and eliminate N+1 joins)
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_children_parent_id ON children(parent_id);
CREATE INDEX IF NOT EXISTS idx_absences_child_id ON absences(child_id);
CREATE INDEX IF NOT EXISTS idx_grades_child_id ON grades(child_id);
CREATE INDEX IF NOT EXISTS idx_parent_devices_parent_id ON parent_devices(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_consents_parent_channel ON parent_consents(parent_id, channel) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notification_events_parent_id ON notification_events(parent_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_event_id ON notification_deliveries(event_id);
CREATE INDEX IF NOT EXISTS idx_app_notifications_parent_unread ON app_notifications(parent_id, read);
