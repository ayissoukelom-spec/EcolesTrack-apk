import path from 'path';
import { existsSync } from 'fs';
import * as dotenv from 'dotenv';
import { Pool } from 'pg';

function loadEnvironment() {
  const candidates = [
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

const pool = new Pool({
  host: process.env.SQL_HOST ?? '127.0.0.1',
  port: Number(process.env.SQL_PORT ?? 5432),
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DB_NAME,
  connectionTimeoutMillis: 15000,
  max: 10,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

export async function initializeMobileTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mobile_parent_devices (
      id SERIAL PRIMARY KEY,
      parent_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      push_token TEXT NOT NULL,
      app_version TEXT NOT NULL,
      last_seen_at TIMESTAMP DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS mobile_parent_devices_unique_idx ON mobile_parent_devices (parent_id, platform, push_token);
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
      id SERIAL PRIMARY KEY,
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
      id SERIAL PRIMARY KEY,
      parent_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mobile_notification_deliveries (
      id SERIAL PRIMARY KEY,
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
}

export async function dbQuery<T = any>(text: string, params: any[] = []) {
  const result = await pool.query(text, params);
  return result as { rows: T[]; rowCount: number };
}

export { pool };
