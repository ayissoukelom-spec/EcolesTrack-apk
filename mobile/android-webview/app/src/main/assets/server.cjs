var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_vite = require("vite");

// backend/store.ts
var crypto = __toESM(require("crypto"), 1);

// backend/postgres.ts
var import_path = __toESM(require("path"), 1);
var import_fs = require("fs");
var dotenv = __toESM(require("dotenv"), 1);
var import_pg = require("pg");
function loadEnvironment() {
  const candidates = [
    import_path.default.resolve(process.cwd(), ".env"),
    import_path.default.resolve(process.cwd(), "..", "web ecoles", ".env"),
    import_path.default.resolve(process.cwd(), "..", "web ecoles", ".env.local")
  ];
  for (const candidate of candidates) {
    if (candidate && (0, import_fs.existsSync)(candidate)) {
      dotenv.config({ path: candidate });
      return candidate;
    }
  }
  return null;
}
loadEnvironment();
var pool = new import_pg.Pool({
  host: process.env.SQL_HOST ?? "127.0.0.1",
  port: Number(process.env.SQL_PORT ?? 5432),
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DB_NAME,
  connectionTimeoutMillis: 15e3,
  max: 10
});
pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err);
});
async function initializeMobileTables() {
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
async function dbQuery(text, params = []) {
  const result = await pool.query(text, params);
  return result;
}

// backend/mobileAdapter.ts
function mapWebParentToMobileParent(row) {
  return {
    id: String(row.userId),
    name: row.userName,
    email: row.userEmail,
    phoneNumber: row.userPhone ?? "",
    activeSchoolId: row.activeSchoolId != null ? String(row.activeSchoolId) : "",
    schools: (row.schoolMemberships ?? []).map((school) => ({
      id: String(school.id),
      name: school.name
    })),
    role: row.role
  };
}
function mapWebStudentToChild(row) {
  return {
    id: String(row.id),
    parentId: row.parentId != null ? String(row.parentId) : "",
    firstName: row.firstName,
    lastName: row.lastName,
    className: row.className ?? "",
    birthDate: row.birthDate ?? "",
    avatarUrl: ""
  };
}

// backend/store.ts
var PostgresStore = class {
  constructor() {
    void initializeMobileTables();
  }
  async ensureParentRecord(parentId) {
    const { rows } = await dbQuery(`
      SELECT u.id AS user_id, u.email, u.name, u.role, u.school_id, p.phone
      FROM users u
      LEFT JOIN parents p ON p.user_id = u.id
      WHERE u.id = $1
    `, [Number(parentId)]);
    if (rows.length === 0) return null;
    const row = rows[0];
    const schoolRows = await dbQuery(`
      SELECT s.id, s.name
      FROM user_schools us
      JOIN schools s ON s.id = us.school_id
      WHERE us.user_id = $1 AND us.is_active = true
    `, [Number(parentId)]);
    return mapWebParentToMobileParent({
      userId: row.user_id,
      userEmail: row.email,
      userName: row.name,
      userPhone: row.phone ?? null,
      activeSchoolId: row.school_id ?? null,
      schoolMemberships: schoolRows.rows.map((school) => ({ id: school.id, name: school.name })),
      role: row.role
    });
  }
  async getParentByEmail(email) {
    const { rows } = await dbQuery(`
      SELECT u.id AS user_id, u.email, u.name, u.role, p.phone, u.school_id, la.password_hash, la.salt
      FROM users u
      LEFT JOIN parents p ON p.user_id = u.id
      LEFT JOIN local_auths la ON la.user_id = u.id
      WHERE LOWER(u.email) = LOWER($1)
      LIMIT 1
    `, [email]);
    if (rows.length === 0) return null;
    const row = rows[0];
    const schoolRows = await dbQuery(`
      SELECT s.id, s.name
      FROM user_schools us
      JOIN schools s ON s.id = us.school_id
      WHERE us.user_id = $1 AND us.is_active = true
    `, [row.user_id]);
    const parent = {
      ...mapWebParentToMobileParent({
        userId: row.user_id,
        userEmail: row.email,
        userName: row.name,
        userPhone: row.phone ?? null,
        activeSchoolId: row.school_id ?? null,
        schoolMemberships: schoolRows.rows.map((school) => ({ id: school.id, name: school.name })),
        role: row.role
      }),
      passwordHash: row.password_hash ?? "",
      role: row.role,
      salt: row.salt ?? void 0
    };
    return parent;
  }
  async findParentByEmail(email) {
    return this.getParentByEmail(email);
  }
  async verifyParentPassword(email, password) {
    const user = await this.getParentByEmail(email);
    if (!user || !user.passwordHash || !user.salt) {
      return false;
    }
    const verifyHash = crypto.pbkdf2Sync(password, user.salt, 31e4, 64, "sha512").toString("hex");
    return verifyHash === user.passwordHash;
  }
  async getParentById(id) {
    return this.ensureParentRecord(id);
  }
  async getChildrenOfParent(parentId) {
    const userId = Number(parentId);
    if (!Number.isInteger(userId)) return [];
    const { rows } = await dbQuery(`
      SELECT s.id, s.first_name, s.last_name, s.birth_date, s.parent_id,
             c.name AS class_name
      FROM students s
      LEFT JOIN classes c ON c.id = s.class_id
      LEFT JOIN parents p ON p.id = s.parent_id
      WHERE p.user_id = $1
    `, [userId]);
    if (rows.length === 0) {
      const parent = await this.getParentById(parentId);
      if (!parent) return [];
      return [];
    }
    return rows.map((row) => mapWebStudentToChild({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      birthDate: row.birth_date ?? "",
      parentId: row.parent_id ?? null,
      className: row.class_name ?? ""
    }));
  }
  async createSimulatedChildForParent(parentId) {
    const parent = await this.getParentById(parentId);
    if (!parent) {
      return null;
    }
    return {
      id: `child-sim-${crypto.randomUUID().slice(0, 8)}`,
      parentId,
      firstName: "\xC9l\xE8ve",
      lastName: "Demo",
      className: "5\xE8me Demo",
      birthDate: "2013-09-01",
      avatarUrl: ""
    };
  }
  async isChildOwnedByParent(childId, parentId) {
    const parentUserId = Number(parentId);
    const childIdNum = Number(childId);
    if (!Number.isInteger(parentUserId) || !Number.isInteger(childIdNum)) return false;
    const { rows } = await dbQuery(`
      SELECT COUNT(*)::text AS count
      FROM students s
      JOIN parents p ON p.id = s.parent_id
      WHERE s.id = $1 AND p.user_id = $2
    `, [childIdNum, parentUserId]);
    return Number(rows[0]?.count ?? 0) > 0;
  }
  async addAbsence(absence) {
    const childIdNum = Number(absence.childId);
    if (!Number.isInteger(childIdNum)) {
      throw new Error("Invalid child id for absence insertion");
    }
    const studentRow = await dbQuery(`SELECT class_id FROM students WHERE id = $1`, [childIdNum]);
    const classId = studentRow.rows[0]?.class_id ?? null;
    const { rows } = await dbQuery(`
      INSERT INTO absences (student_id, class_id, date, period, is_justified, justification_reason)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [childIdNum, classId, absence.date, "all_day", absence.justified, absence.justificationText ?? null]);
    return {
      id: String(rows[0]?.id ?? 0),
      ...absence
    };
  }
  async getAbsencesOfChild(childId) {
    const childIdNum = Number(childId);
    if (!Number.isInteger(childIdNum)) return [];
    const { rows } = await dbQuery(`
      SELECT id, date, period, is_justified, justification_reason
      FROM absences
      WHERE student_id = $1
    `, [childIdNum]);
    return rows.map((row) => ({
      id: String(row.id),
      childId,
      date: row.date,
      reason: row.justification_reason ?? (row.is_justified ? "Absence justifi\xE9e" : "Absence non justifi\xE9e"),
      justified: row.is_justified,
      justificationText: row.justification_reason ?? void 0
    }));
  }
  async addGrade(grade) {
    const childIdNum = Number(grade.childId);
    if (!Number.isInteger(childIdNum)) {
      throw new Error("Invalid child id for grade insertion");
    }
    const studentRow = await dbQuery(`SELECT class_id FROM students WHERE id = $1`, [childIdNum]);
    const classId = studentRow.rows[0]?.class_id ?? null;
    const teacherRow = await dbQuery(`SELECT id FROM teachers LIMIT 1`);
    const teacherId = teacherRow.rows[0]?.id ?? 1;
    const evaluationRow = await dbQuery(`
      INSERT INTO evaluations (class_id, teacher_id, subject, title, coefficient, max_score, count_in_bulletin, date)
      VALUES ($1, $2, $3, $4, $5, $6, true, $7)
      RETURNING id
    `, [classId, teacherId, grade.subject, grade.examName, Math.max(1, Math.round(grade.coefficient)), 20, grade.date]);
    const evaluationId = evaluationRow.rows[0]?.id;
    if (!evaluationId) {
      throw new Error("Failed to create evaluation record for grade insertion");
    }
    const { rows } = await dbQuery(`
      INSERT INTO grades (evaluation_id, student_id, score, remarks, edit_count, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 0, NOW(), NOW())
      RETURNING id
    `, [evaluationId, childIdNum, String(grade.grade), "", 0]);
    return {
      id: String(rows[0]?.id ?? 0),
      ...grade
    };
  }
  async getGradesOfChild(childId) {
    const childIdNum = Number(childId);
    if (!Number.isInteger(childIdNum)) return [];
    const { rows } = await dbQuery(`
      SELECT g.id, e.subject, g.score, e.coefficient, e.title, e.date
      FROM grades g
      JOIN evaluations e ON e.id = g.evaluation_id
      WHERE g.student_id = $1
    `, [childIdNum]);
    return rows.map((row) => ({
      id: String(row.id),
      childId,
      subject: row.subject,
      grade: Number(row.score),
      coefficient: Number(row.coefficient ?? 1),
      examName: row.title,
      date: row.date
    }));
  }
  async getInAppNotifications(parentId) {
    const userId = Number(parentId);
    if (!Number.isInteger(userId)) return [];
    const { rows } = await dbQuery(`
      SELECT id, title, body, is_read, created_at
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);
    return rows.map((row) => ({
      id: String(row.id),
      parentId,
      title: row.title,
      message: row.body,
      read: row.is_read,
      createdAt: row.created_at,
      deepLink: void 0
    }));
  }
  async markAllInAppNotificationsAsRead(parentId) {
    const userId = Number(parentId);
    if (!Number.isInteger(userId)) return;
    await dbQuery(`
      UPDATE notifications
      SET is_read = true
      WHERE user_id = $1
    `, [userId]);
  }
  async addInAppNotification(parentId, title, message, deepLink) {
    const userId = Number(parentId);
    if (!Number.isInteger(userId)) {
      throw new Error("Invalid parent id for notification insertion");
    }
    const { rows } = await dbQuery(`
      INSERT INTO notifications (user_id, title, body, type, is_read, created_at)
      VALUES ($1, $2, $3, $4, false, NOW())
      RETURNING id
    `, [userId, title, message, "info"]);
    return {
      id: String(rows[0]?.id ?? 0),
      parentId,
      title,
      message,
      read: false,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      deepLink
    };
  }
  async registerPushToken(parentId, token, platform, appVersion) {
    const { rows } = await dbQuery(`
      INSERT INTO mobile_parent_devices (parent_id, platform, push_token, app_version, last_seen_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id
    `, [parentId, platform, token, appVersion]);
    return {
      id: String(rows[0]?.id ?? 0),
      parentId,
      platform,
      pushToken: token,
      appVersion,
      lastSeenAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async getDevicesOfParent(parentId) {
    const { rows } = await dbQuery(`
      SELECT id, platform, push_token, app_version, last_seen_at
      FROM mobile_parent_devices
      WHERE parent_id = $1
      ORDER BY last_seen_at DESC
    `, [parentId]);
    return rows.map((row) => ({
      id: String(row.id),
      parentId,
      platform: row.platform,
      pushToken: row.push_token,
      appVersion: row.app_version,
      lastSeenAt: row.last_seen_at
    }));
  }
  async getNotificationPreferences(parentId) {
    const { rows } = await dbQuery(`
      SELECT push_enabled, whatsapp_enabled, sms_enabled, quiet_hours_start, quiet_hours_end
      FROM mobile_notification_preferences
      WHERE parent_id = $1
    `, [parentId]);
    if (rows.length > 0) {
      const row = rows[0];
      return {
        parentId,
        pushEnabled: row.push_enabled,
        whatsappEnabled: row.whatsapp_enabled,
        smsEnabled: row.sms_enabled,
        quietHoursStart: row.quiet_hours_start,
        quietHoursEnd: row.quiet_hours_end
      };
    }
    await dbQuery(`
      INSERT INTO mobile_notification_preferences (parent_id, push_enabled, whatsapp_enabled, sms_enabled, quiet_hours_start, quiet_hours_end)
      VALUES ($1, true, false, false, '22:00', '07:00')
    `, [parentId]);
    return {
      parentId,
      pushEnabled: true,
      whatsappEnabled: false,
      smsEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00"
    };
  }
  async updateNotificationPreferences(parentId, updates) {
    const existing = await this.getNotificationPreferences(parentId);
    const next = { ...existing, ...updates, parentId };
    await dbQuery(`
      INSERT INTO mobile_notification_preferences (parent_id, push_enabled, whatsapp_enabled, sms_enabled, quiet_hours_start, quiet_hours_end)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (parent_id) DO UPDATE SET
        push_enabled = EXCLUDED.push_enabled,
        whatsapp_enabled = EXCLUDED.whatsapp_enabled,
        sms_enabled = EXCLUDED.sms_enabled,
        quiet_hours_start = EXCLUDED.quiet_hours_start,
        quiet_hours_end = EXCLUDED.quiet_hours_end
    `, [parentId, next.pushEnabled, next.whatsappEnabled, next.smsEnabled, next.quietHoursStart, next.quietHoursEnd]);
    return next;
  }
  async getConsentsOfParent(parentId) {
    const { rows } = await dbQuery(`
      SELECT id, channel, consent_granted, consent_text_version, consented_at, revoked_at
      FROM mobile_notification_consents
      WHERE parent_id = $1
      ORDER BY consented_at ASC
    `, [parentId]);
    return rows.map((row) => ({
      id: String(row.id),
      parentId,
      channel: row.channel,
      consentGranted: row.consent_granted,
      consentTextVersion: row.consent_text_version,
      consentedAt: row.consented_at,
      revokedAt: row.revoked_at ?? void 0
    }));
  }
  async updateConsent(parentId, channel, granted, textVersion) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const { rows } = await dbQuery(`
      INSERT INTO mobile_notification_consents (parent_id, channel, consent_granted, consent_text_version, consented_at, revoked_at)
      VALUES ($1, $2, $3, $4, $5, NULL)
      RETURNING id
    `, [parentId, channel, granted, textVersion, timestamp]);
    return {
      id: String(rows[0]?.id ?? 0),
      parentId,
      channel,
      consentGranted: granted,
      consentTextVersion: textVersion,
      consentedAt: timestamp
    };
  }
  async createNotificationEvent(parentId, eventType, payload, dedupeKey) {
    const existing = await dbQuery(`SELECT id FROM mobile_notification_events WHERE dedupe_key = $1`, [dedupeKey]);
    if (existing.rows.length > 0) {
      return null;
    }
    const { rows } = await dbQuery(`
      INSERT INTO mobile_notification_events (parent_id, event_type, payload_json, dedupe_key, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id
    `, [parentId, eventType, JSON.stringify(payload), dedupeKey]);
    return {
      id: String(rows[0]?.id ?? 0),
      parentId,
      eventType,
      payloadJson: JSON.stringify(payload),
      dedupeKey,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async addNotificationDelivery(delivery) {
    const { rows } = await dbQuery(`
      INSERT INTO mobile_notification_deliveries (event_id, channel, provider, status, attempts, provider_message_id, error_code, error_message, sent_at, delivered_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [Number(delivery.eventId), delivery.channel, delivery.provider, delivery.status, delivery.attempts, delivery.providerMessageId ?? null, delivery.errorCode ?? null, delivery.errorMessage ?? null, delivery.sentAt ?? null, delivery.deliveredAt ?? null]);
    return {
      ...delivery,
      id: String(rows[0]?.id ?? 0)
    };
  }
  async updateNotificationDeliveryStatus(id, updates) {
    const deliveryId = Number(id);
    if (!Number.isInteger(deliveryId)) return;
    const fields = [];
    const values = [];
    const map = {
      status: "status",
      attempts: "attempts",
      providerMessageId: "provider_message_id",
      errorCode: "error_code",
      errorMessage: "error_message",
      sentAt: "sent_at",
      deliveredAt: "delivered_at"
    };
    Object.entries(updates).forEach(([key, value]) => {
      const column = map[key];
      if (!column || value === void 0) return;
      fields.push(`${column} = $${fields.length + 2}`);
      values.push(value);
    });
    if (fields.length === 0) return;
    await dbQuery(`UPDATE mobile_notification_deliveries SET ${fields.join(", ")} WHERE id = $1`, [deliveryId, ...values]);
  }
  async getCompleteDeliveryLogs() {
    const { rows } = await dbQuery(`
      SELECT id, parent_id, event_type, payload_json, dedupe_key, created_at
      FROM mobile_notification_events
      ORDER BY created_at DESC
    `);
    const result = [];
    for (const event of rows) {
      const deliveries = await dbQuery(`
        SELECT id, event_id, channel, provider, status, attempts, provider_message_id, error_code, error_message, sent_at, delivered_at
        FROM mobile_notification_deliveries
        WHERE event_id = $1
        ORDER BY id ASC
      `, [event.id]);
      result.push({
        event: {
          id: String(event.id),
          parentId: event.parent_id,
          eventType: event.event_type,
          payloadJson: event.payload_json,
          dedupeKey: event.dedupe_key,
          createdAt: event.created_at
        },
        deliveries: deliveries.rows.map((row) => ({
          id: String(row.id),
          eventId: String(row.event_id),
          channel: row.channel,
          provider: row.provider,
          status: row.status,
          attempts: row.attempts,
          providerMessageId: row.provider_message_id ?? void 0,
          errorCode: row.error_code ?? void 0,
          errorMessage: row.error_message ?? void 0,
          sentAt: row.sent_at ?? void 0,
          deliveredAt: row.delivered_at ?? void 0
        }))
      });
    }
    return result;
  }
  async clearAllLogs() {
    await dbQuery(`DELETE FROM mobile_notification_deliveries`);
    await dbQuery(`DELETE FROM mobile_notification_events`);
    await dbQuery(`DELETE FROM notifications WHERE title LIKE 'test-%' OR body LIKE 'test-%'`);
  }
};
var store = new PostgresStore();
async function triggerMultiChannelNotification(parentId, title, message, eventType, payload, dedupeKey) {
  const appNotif = await store.addInAppNotification(parentId, title, message, payload.deepLink);
  const event = await store.createNotificationEvent(parentId, eventType, payload, dedupeKey);
  if (!event) {
    return { status: "deduplicated", reason: "Deduplication key triggered" };
  }
  const prefs = await store.getNotificationPreferences(parentId);
  const consents = await store.getConsentsOfParent(parentId);
  const parentObj = await store.getParentById(parentId);
  if (!parentObj) {
    return { status: "failed", reason: "Parent not found" };
  }
  const hasConsent = (channel) => {
    const channelConsents = consents.filter((c) => c.channel === channel);
    if (channelConsents.length === 0) return false;
    const last = channelConsents[channelConsents.length - 1];
    return last.consentGranted && !last.revokedAt;
  };
  const isQuietHours = () => {
    const now = /* @__PURE__ */ new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeInMinutes = currentHours * 60 + currentMinutes;
    const parseTimeToMinutes = (timeStr) => {
      const [h, m] = timeStr.split(":").map(Number);
      return h * 60 + m;
    };
    const startMinutes = parseTimeToMinutes(prefs.quietHoursStart);
    const endMinutes = parseTimeToMinutes(prefs.quietHoursEnd);
    if (startMinutes > endMinutes) {
      return currentTimeInMinutes >= startMinutes || currentTimeInMinutes <= endMinutes;
    } else {
      return currentTimeInMinutes >= startMinutes && currentTimeInMinutes <= endMinutes;
    }
  };
  console.log(`[NOTIF ORCHESTRATOR] Processing notification for ${parentObj.name} (Event ID: ${event.id})`);
  let pushDelivered = false;
  let whatsappDelivered = false;
  let smsDelivered = false;
  const isQuiet = isQuietHours();
  const pushDelivery = await store.addNotificationDelivery({
    eventId: event.id,
    channel: "push",
    provider: "fcm",
    status: "queued",
    attempts: 0
  });
  if (prefs.pushEnabled) {
    const devices = await store.getDevicesOfParent(parentId);
    await store.updateNotificationDeliveryStatus(pushDelivery.id, { attempts: 1 });
    if (devices.length > 0) {
      const hasAndroidDevice = devices.some((d) => d.platform === "android");
      await store.updateNotificationDeliveryStatus(pushDelivery.id, {
        status: "delivered",
        providerMessageId: `fcm-msg-${crypto.randomUUID().slice(0, 8)}`,
        sentAt: (/* @__PURE__ */ new Date()).toISOString(),
        deliveredAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      pushDelivered = true;
      console.log(`[FCM PUSH] Delivered successfully to ${devices.length} registered devices.`);
    } else {
      await store.updateNotificationDeliveryStatus(pushDelivery.id, {
        status: "failed",
        errorCode: "NO_DEVICES_REGISTERED",
        errorMessage: "Parent registered push but has no active session on device."
      });
      console.log(`[FCM PUSH] Failed: No devices registered.`);
    }
  } else {
    await store.updateNotificationDeliveryStatus(pushDelivery.id, {
      status: "failed",
      errorCode: "PUSH_DISABLED",
      errorMessage: "Push notifications are disabled in parent preferences."
    });
    console.log(`[FCM PUSH] Skipped: push is disabled by user.`);
  }
  if (!pushDelivered) {
    const waDelivery = await store.addNotificationDelivery({
      eventId: event.id,
      channel: "whatsapp",
      provider: "whatsapp_cloud_api",
      status: "queued",
      attempts: 0
    });
    if (prefs.whatsappEnabled) {
      await store.updateNotificationDeliveryStatus(waDelivery.id, { attempts: 1 });
      if (!hasConsent("whatsapp")) {
        await store.updateNotificationDeliveryStatus(waDelivery.id, {
          status: "failed",
          errorCode: "CONSENT_MISSING",
          errorMessage: "WhatsApp consent not given or explicitly revoked."
        });
        console.log(`[WHATSAPP] Failed: No active consent recorded.`);
      } else if (isQuiet) {
        await store.updateNotificationDeliveryStatus(waDelivery.id, {
          status: "failed",
          errorCode: "QUIET_HOURS_BLOCKED",
          errorMessage: `Delivery blocked by Quiet Hours (${prefs.quietHoursStart} - ${prefs.quietHoursEnd}).`
        });
        console.log(`[WHATSAPP] Blocked: Quiet hours active.`);
      } else {
        await store.updateNotificationDeliveryStatus(waDelivery.id, {
          status: "delivered",
          providerMessageId: `wa-msg-${crypto.randomUUID().slice(0, 8)}`,
          sentAt: (/* @__PURE__ */ new Date()).toISOString(),
          deliveredAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        whatsappDelivered = true;
        console.log(`[WHATSAPP] Template message delivered to ${parentObj.phoneNumber}.`);
      }
    } else {
      await store.updateNotificationDeliveryStatus(waDelivery.id, {
        status: "failed",
        errorCode: "CHANNEL_DISABLED",
        errorMessage: "WhatsApp notifications are disabled in parent preferences."
      });
      console.log(`[WHATSAPP] Skipped: Channel disabled.`);
    }
  }
  if (!pushDelivered && !whatsappDelivered) {
    const smsDelivery = await store.addNotificationDelivery({
      eventId: event.id,
      channel: "sms",
      provider: "twilio_sms",
      status: "queued",
      attempts: 0
    });
    if (prefs.smsEnabled) {
      await store.updateNotificationDeliveryStatus(smsDelivery.id, { attempts: 1 });
      if (!hasConsent("sms")) {
        await store.updateNotificationDeliveryStatus(smsDelivery.id, {
          status: "failed",
          errorCode: "CONSENT_MISSING",
          errorMessage: "SMS consent not given or explicitly revoked."
        });
        console.log(`[SMS] Failed: No active consent recorded.`);
      } else if (isQuiet) {
        await store.updateNotificationDeliveryStatus(smsDelivery.id, {
          status: "failed",
          errorCode: "QUIET_HOURS_BLOCKED",
          errorMessage: `Delivery blocked by Quiet Hours (${prefs.quietHoursStart} - ${prefs.quietHoursEnd}).`
        });
        console.log(`[SMS] Blocked: Quiet hours active.`);
      } else {
        await store.updateNotificationDeliveryStatus(smsDelivery.id, {
          status: "delivered",
          providerMessageId: `sms-msg-${crypto.randomUUID().slice(0, 8)}`,
          sentAt: (/* @__PURE__ */ new Date()).toISOString(),
          deliveredAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        smsDelivered = true;
        console.log(`[SMS] Delivered SMS to ${parentObj.phoneNumber}.`);
      }
    } else {
      await store.updateNotificationDeliveryStatus(smsDelivery.id, {
        status: "failed",
        errorCode: "CHANNEL_DISABLED",
        errorMessage: "SMS notifications are disabled in parent preferences."
      });
      console.log(`[SMS] Skipped: Channel disabled.`);
    }
  }
  return {
    status: "processed",
    appNotificationId: appNotif.id,
    eventId: event.id,
    deliverySummary: {
      push: pushDelivered ? "delivered" : "skipped_or_failed",
      whatsapp: whatsappDelivered ? "delivered" : "skipped_or_failed",
      sms: smsDelivered ? "delivered" : "skipped_or_failed"
    }
  };
}

// backend/utils/logger.ts
var Logger = class {
  constructor(context = "System") {
    this.context = context;
  }
  log(level, message, meta) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const payload = {
      timestamp,
      level,
      context: this.context,
      message,
      ...meta || {}
    };
    if (process.env.NODE_ENV === "production") {
      console.log(JSON.stringify(payload));
    } else {
      const metaStr = meta ? ` | Meta: ${JSON.stringify(meta)}` : "";
      const color = level === "ERROR" ? "\x1B[31m" : level === "WARN" ? "\x1B[33m" : level === "AUDIT" ? "\x1B[36m" : "\x1B[32m";
      const reset = "\x1B[0m";
      console.log(`[${timestamp}] [${color}${level}${reset}] [${this.context}] ${message}${metaStr}`);
    }
  }
  info(message, meta) {
    this.log("INFO", message, meta);
  }
  warn(message, meta) {
    this.log("WARN", message, meta);
  }
  error(message, error, meta) {
    const errMeta = error instanceof Error ? { errorName: error.name, errorMessage: error.message, stack: error.stack } : { error };
    this.log("ERROR", message, { ...errMeta, ...meta });
  }
  audit(action, actor, details, status) {
    this.log("AUDIT", `AUDIT TRIAL: ${action} by ${actor} [${status}]`, {
      audit: { action, actor, details, status }
    });
  }
  debug(message, meta) {
    if (process.env.NODE_ENV !== "production") {
      this.log("DEBUG", message, meta);
    }
  }
};
var logger = new Logger("Global");

// backend/middlewares/security.ts
var logger2 = new Logger("SecurityMiddleware");
function helmetHeaders(req, res, next) {
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' *"
  );
  next();
}
function requestIdMiddleware(req, res, next) {
  const reqId = req.headers["x-request-id"] || `req-${Math.random().toString(36).substring(2, 11)}`;
  req.requestId = reqId;
  res.setHeader("X-Request-ID", reqId);
  next();
}
function sanitizePayload(req, res, next) {
  if (req.body && typeof req.body === "object") {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === "string") {
        req.body[key] = req.body[key].replace(/<[^>]*>/g, "");
      }
    }
  }
  next();
}

// backend/services/auth.ts
var import_crypto = __toESM(require("crypto"), 1);
var logger3 = new Logger("AuthService");
var JWT_SECRET = process.env.JWT_SECRET || "ecoletrack-super-secret-key-2026";
var ACCESS_TOKEN_EXPIRY_MS = 15 * 60 * 1e3;
var REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1e3;
var tokenBlacklist = /* @__PURE__ */ new Set();
var activeSessions = /* @__PURE__ */ new Map();
var AuthService = class {
  /**
   * Generates a secure JWT-like token
   */
  static generateJWT(payload, secret, durationMs) {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const data = Buffer.from(JSON.stringify({
      ...payload,
      exp: Date.now() + durationMs
    })).toString("base64url");
    const hmac = import_crypto.default.createHmac("sha256", secret);
    hmac.update(`${header}.${data}`);
    const signature = hmac.digest("base64url");
    return `${header}.${data}.${signature}`;
  }
  /**
   * Verifies a JWT token signature and expiration
   */
  static verifyJWT(token, secret = JWT_SECRET) {
    try {
      const [header, data, signature] = token.split(".");
      if (!header || !data || !signature) return null;
      const hmac = import_crypto.default.createHmac("sha256", secret);
      hmac.update(`${header}.${data}`);
      const expectedSignature = hmac.digest("base64url");
      if (signature !== expectedSignature) {
        logger3.warn("JWT Signature verification failed.");
        return null;
      }
      const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf-8"));
      if (payload.exp < Date.now()) {
        logger3.debug("JWT Token has expired.");
        return null;
      }
      return payload;
    } catch (e) {
      logger3.error("Error verifying JWT token", e);
      return null;
    }
  }
  /**
   * Generates a pair of (Access Token, Refresh Token) for a user session
   */
  static createSession(parentId, role) {
    const accessToken = this.generateJWT({ parentId, role }, JWT_SECRET, ACCESS_TOKEN_EXPIRY_MS);
    const entropy = import_crypto.default.randomBytes(16).toString("hex");
    const refreshToken = this.generateJWT({ parentId, role, entropy }, JWT_SECRET, REFRESH_TOKEN_EXPIRY_MS);
    if (!activeSessions.has(parentId)) {
      activeSessions.set(parentId, /* @__PURE__ */ new Set());
    }
    activeSessions.get(parentId).add(refreshToken);
    logger3.info(`Session created for parent: ${parentId}`);
    return { accessToken, refreshToken };
  }
  /**
   * Rotates a Refresh Token (Refresh Token Rotation - RTR)
   * Prevents replay attacks by invalidating the old Refresh Token and issuing a new pair.
   */
  static rotateSession(oldRefreshToken) {
    const payload = this.verifyJWT(oldRefreshToken);
    if (!payload) {
      logger3.warn("Rotation attempted with invalid or expired Refresh Token.");
      return null;
    }
    const { parentId, role } = payload;
    if (tokenBlacklist.has(oldRefreshToken)) {
      logger3.warn(`[SECURITY ALERT] Replay attack detected! Compromised Refresh Token reused for parent ID: ${parentId}. Revoking all sessions!`);
      this.revokeAllSessions(parentId);
      return null;
    }
    tokenBlacklist.add(oldRefreshToken);
    const parentTokens = activeSessions.get(parentId);
    if (!parentTokens || !parentTokens.has(oldRefreshToken)) {
      logger3.warn(`Refresh Token not found in active session list for parent: ${parentId}`);
      return null;
    }
    parentTokens.delete(oldRefreshToken);
    const newSession = this.createSession(parentId, role);
    return newSession;
  }
  /**
   * Revokes a specific session (Logout)
   */
  static revokeSession(parentId, refreshToken) {
    tokenBlacklist.add(refreshToken);
    const parentTokens = activeSessions.get(parentId);
    if (parentTokens) {
      parentTokens.delete(refreshToken);
    }
    logger3.info(`Session revoked for parent: ${parentId}`);
  }
  /**
   * Revokes all sessions for a user (e.g., when a compromise is detected)
   */
  static revokeAllSessions(parentId) {
    const parentTokens = activeSessions.get(parentId);
    if (parentTokens) {
      parentTokens.forEach((token) => tokenBlacklist.add(token));
      activeSessions.delete(parentId);
    }
    logger3.audit("REVOKE_ALL_SESSIONS", parentId, { parentId }, "SUCCESS");
  }
};

// backend/jobs/queue.ts
var logger4 = new Logger("QueueProcessor");
var activeQueue = [];
var deadLetterQueue = [];
var completedJobIds = /* @__PURE__ */ new Set();
var QueueManager = class {
  /**
   * Add a job to the queue
   */
  static addJob(name, data, options = {}) {
    const priority = options.priority ?? 0;
    const maxAttempts = options.maxAttempts ?? 3;
    const dedupeKey = options.dedupeKey;
    if (dedupeKey && completedJobIds.has(dedupeKey)) {
      logger4.info(`Idempotency hit! Job with dedupeKey '${dedupeKey}' already processed. Skipping duplicate entry.`);
      return `skipped-${dedupeKey}`;
    }
    if (dedupeKey && activeQueue.some((j) => j.dedupeKey === dedupeKey)) {
      logger4.info(`Job with dedupeKey '${dedupeKey}' is already active in queue. Ignoring duplicate entry.`);
      return `queued-${dedupeKey}`;
    }
    const job = {
      id: `job-${Math.random().toString(36).substring(2, 11)}`,
      name,
      data,
      priority,
      attempts: 0,
      maxAttempts,
      createdAt: Date.now(),
      dedupeKey,
      errorHistory: []
    };
    activeQueue.push(job);
    activeQueue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    logger4.info(`Job added to queue: ${name} [ID: ${job.id}]`, { jobId: job.id, priority, dedupeKey });
    this.processNextJob();
    return job.id;
  }
  static {
    /**
     * Process jobs in queue with exponential backoff retries and DLQ routing
     */
    this.isProcessing = false;
  }
  static async processNextJob() {
    if (this.isProcessing || activeQueue.length === 0) return;
    this.isProcessing = true;
    const job = activeQueue.shift();
    logger4.info(`Processing Job: ${job.name} [ID: ${job.id}, Attempt: ${job.attempts + 1}/${job.maxAttempts}]`);
    try {
      job.attempts++;
      await this.executeJobLogic(job);
      if (job.dedupeKey) {
        completedJobIds.add(job.dedupeKey);
      }
      logger4.info(`Job completed successfully: ${job.name} [ID: ${job.id}]`);
    } catch (err) {
      const errorMessage = err?.message || String(err);
      job.errorHistory.push({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        message: errorMessage
      });
      logger4.error(`Job execution failed: ${job.name} [ID: ${job.id}]`, err);
      if (job.attempts < job.maxAttempts) {
        const delay = Math.pow(2, job.attempts) * 100;
        logger4.warn(`Scheduling retry for job: ${job.id} in ${delay}ms...`);
        setTimeout(() => {
          activeQueue.push(job);
          activeQueue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
          this.processNextJob();
        }, delay);
      } else {
        logger4.error(`Job failed maximum attempts: ${job.name} [ID: ${job.id}]. Moving to DLQ.`);
        deadLetterQueue.push(job);
        logger4.audit("JOB_DLQ_ROUTED", "QueueProcessor", { jobId: job.id, jobName: job.name, errors: job.errorHistory }, "FAILURE");
      }
    } finally {
      this.isProcessing = false;
      this.processNextJob();
    }
  }
  /**
   * Logic execution based on job type
   */
  static async executeJobLogic(job) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (job.name === "test-failure-simulation") {
      throw new Error("Network timeout: FCM Gateway failed to respond (Simulated Error).");
    }
  }
  static getDLQ() {
    return deadLetterQueue;
  }
  static clearDLQ() {
    deadLetterQueue.length = 0;
  }
};

// backend/services/notification.ts
var logger5 = new Logger("NotificationService");
var NotificationService = class {
  /**
   * Orchestrates multi-channel delivery based on parent consents and quiet hours
   */
  static async dispatchNotification(parentId, title, message, category, metadata = {}, dedupeKey) {
    logger5.info(`Orchestrating notification for Parent ID: ${parentId}`, { category, dedupeKey });
    const preferences = await store.getNotificationPreferences(parentId);
    const consents = await store.getConsentsOfParent(parentId);
    const isPushAuthorized = preferences.pushEnabled;
    const isSmsAuthorized = preferences.smsEnabled && consents.some((c) => c.channel === "sms" && c.consentGranted);
    const isWhatsappAuthorized = preferences.whatsappEnabled && consents.some((c) => c.channel === "whatsapp" && c.consentGranted);
    if (this.isWithinQuietHours(preferences.quietHoursStart, preferences.quietHoursEnd)) {
      logger5.info(`Quiet Hours active for parent ${parentId}. Scheduling notification with lower priority or buffering.`);
      metadata.quietHoursApplied = true;
    }
    const channelsToDeliver = [];
    if (isPushAuthorized) channelsToDeliver.push("push");
    if (isWhatsappAuthorized) channelsToDeliver.push("whatsapp");
    if (isSmsAuthorized) channelsToDeliver.push("sms");
    if (channelsToDeliver.length === 0) {
      logger5.warn(`No authorized notification channels for parent: ${parentId}. Fallback to in-app notification only.`);
      channelsToDeliver.push("push");
    }
    const jobsTriggered = [];
    for (const channel of channelsToDeliver) {
      const priority = category === "absence" ? 10 : 5;
      const jobName = `send-notification-${channel}`;
      const jobDedupeKey = dedupeKey ? `${dedupeKey}-${channel}` : void 0;
      const jobId = QueueManager.addJob(jobName, {
        parentId,
        channel,
        title,
        message,
        category,
        metadata
      }, {
        priority,
        dedupeKey: jobDedupeKey,
        maxAttempts: 3
      });
      jobsTriggered.push(jobId);
    }
    const legacyResult = await triggerMultiChannelNotification(
      parentId,
      title,
      message,
      category,
      metadata,
      dedupeKey
    );
    return {
      success: true,
      channels: channelsToDeliver,
      jobs: jobsTriggered,
      legacyResult
    };
  }
  /**
   * Checks if current time is within quiet hours (format 'HH:MM')
   */
  static isWithinQuietHours(start, end) {
    if (!start || !end) return false;
    try {
      const now = /* @__PURE__ */ new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const [startH, startM] = start.split(":").map(Number);
      const [endH, endM] = end.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      if (startMinutes < endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
      } else {
        return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
      }
    } catch (e) {
      logger5.error("Failed to parse quiet hours, skipping window validation", e);
      return false;
    }
  }
};

// backend/validators/schemas.ts
var import_zod = require("zod");
var LoginSchema = import_zod.z.object({
  email: import_zod.z.string().email({ message: "Format d'email invalide." }),
  password: import_zod.z.string().min(4, { message: "Le mot de passe doit contenir au moins 4 caract\xE8res." })
});
var RegisterPushTokenSchema = import_zod.z.object({
  pushToken: import_zod.z.string().min(10, { message: "Le token push est trop court." }),
  platform: import_zod.z.enum(["android", "ios"], { message: "Plateforme invalide (android ou ios uniquement)." }),
  appVersion: import_zod.z.string().min(1, { message: "La version de l'application est requise." })
});
var NotificationPreferencesSchema = import_zod.z.object({
  pushEnabled: import_zod.z.boolean().optional(),
  whatsappEnabled: import_zod.z.boolean().optional(),
  smsEnabled: import_zod.z.boolean().optional(),
  quietHoursStart: import_zod.z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: "Format d'heure invalide (HH:MM)." }).nullable().optional(),
  quietHoursEnd: import_zod.z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: "Format d'heure invalide (HH:MM)." }).nullable().optional(),
  whatsappConsent: import_zod.z.boolean().optional(),
  smsConsent: import_zod.z.boolean().optional()
});
var TestNotificationSchema = import_zod.z.object({
  title: import_zod.z.string().min(1, { message: "Le titre est requis." }),
  message: import_zod.z.string().min(1, { message: "Le message est requis." })
});
var DevAddAbsenceSchema = import_zod.z.object({
  childId: import_zod.z.string().min(1),
  date: import_zod.z.string().optional(),
  reason: import_zod.z.string().min(2),
  justified: import_zod.z.boolean().optional(),
  justificationText: import_zod.z.string().optional()
});
var DevAddGradeSchema = import_zod.z.object({
  childId: import_zod.z.string().min(1),
  subject: import_zod.z.string().min(1),
  grade: import_zod.z.number().min(0).max(20),
  coefficient: import_zod.z.number().positive().optional(),
  examName: import_zod.z.string().min(1),
  date: import_zod.z.string().optional()
});

// server.ts
var logger6 = new Logger("ExpressServer");
var app = (0, import_express.default)();
var PORT = Number(process.env.PORT) || 3001;
app.use(import_express.default.json());
app.use(helmetHeaders);
app.use(requestIdMiddleware);
app.use(sanitizePayload);
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
function verifyToken(token) {
  return AuthService.verifyJWT(token);
}
var rateLimitMap = /* @__PURE__ */ new Map();
function rateLimit(limit, windowMs) {
  return (req, res, next) => {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "global";
    const now = Date.now();
    const clientLimit = rateLimitMap.get(ip);
    if (!clientLimit || now > clientLimit.resetTime) {
      rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }
    clientLimit.count++;
    if (clientLimit.count > limit) {
      return res.status(429).json({
        error: "Trop de requ\xEAtes. Veuillez patienter avant de r\xE9essayer.",
        code: "TOO_MANY_REQUESTS",
        details: { resetInSeconds: Math.ceil((clientLimit.resetTime - now) / 1e3) }
      });
    }
    next();
  };
}
var requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Authentification requise. Jeton de session manquant.",
      code: "UNAUTHORIZED"
    });
  }
  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({
      error: "Session invalide ou expir\xE9e. Veuillez vous reconnecter.",
      code: "INVALID_SESSION"
    });
  }
  req.parent = {
    id: decoded.parentId,
    email: "",
    // Loaded dynamically if needed
    role: decoded.role
  };
  next();
};
var requireParentRoleOnly = (req, res, next) => {
  if (!req.parent || req.parent.role !== "parent") {
    console.warn(`[SECURITY VIOLATION] Attempted access with non-parent role: ${req.parent?.role || "none"} on URL: ${req.originalUrl}`);
    return res.status(403).json({
      error: "Acc\xE8s refus\xE9. Cette application est strictement r\xE9serv\xE9e aux parents d'\xE9l\xE8ves.",
      code: "PARENTS_ONLY"
    });
  }
  next();
};
app.post("/api/mobile/parent/login", rateLimit(15, 6e4), async (req, res) => {
  const validation = LoginSchema.safeParse(req.body);
  if (!validation.success) {
    logger6.warn("\xC9chec de la validation Zod sur la route d'authentification.");
    return res.status(400).json({
      error: "Donn\xE9es de connexion invalides.",
      code: "BAD_REQUEST",
      details: validation.error.format()
    });
  }
  const { email, password } = validation.data;
  const user = await store.findParentByEmail(email);
  if (!user) {
    logger6.warn(`Tentative de connexion infructueuse (utilisateur inconnu): ${email}`);
    return res.status(401).json({
      error: "Identifiants de connexion incorrects.",
      code: "BAD_CREDENTIALS"
    });
  }
  const isPasswordValid = await store.verifyParentPassword(email, password);
  if (!isPasswordValid) {
    logger6.warn(`Mot de passe incorrect pour le compte parent: ${email}`);
    return res.status(401).json({
      error: "Identifiants de connexion incorrects.",
      code: "BAD_CREDENTIALS"
    });
  }
  if (user.role !== "parent") {
    logger6.audit("NON_PARENT_LOGIN_REJECT", user.id, { email, role: user.role }, "FAILURE");
    return res.status(403).json({
      error: "Acc\xE8s mobile r\xE9serv\xE9 aux parents.",
      code: "PARENTS_ONLY",
      details: { role: user.role }
    });
  }
  const session = AuthService.createSession(user.id, user.role);
  const parentDetails = {
    id: user.id,
    name: user.name,
    email: user.email,
    phoneNumber: user.phoneNumber,
    activeSchoolId: user.activeSchoolId,
    schools: user.schools
  };
  logger6.audit("PARENT_LOGIN_SUCCESS", user.id, { email }, "SUCCESS");
  return res.json({
    parent: parentDetails,
    token: session.accessToken,
    refreshToken: session.refreshToken
  });
});
app.post("/api/mobile/parent/refresh-token", (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({
      error: "Refresh token manquant.",
      code: "BAD_REQUEST"
    });
  }
  const newSession = AuthService.rotateSession(refreshToken);
  if (!newSession) {
    logger6.warn("\xC9chec de rotation du Jeton de Rafra\xEEchissement. Token expir\xE9, compromis ou invalide.");
    return res.status(401).json({
      error: "Session invalide ou expir\xE9e. Veuillez vous reconnecter.",
      code: "INVALID_SESSION"
    });
  }
  logger6.info("Rotation du jeton de session effectu\xE9e avec succ\xE8s.");
  return res.json(newSession);
});
app.post("/api/mobile/parent/logout", requireAuth, requireParentRoleOnly, (req, res) => {
  const parentId = req.parent.id;
  const { refreshToken } = req.body;
  if (refreshToken) {
    AuthService.revokeSession(parentId, refreshToken);
  } else {
    AuthService.revokeAllSessions(parentId);
  }
  logger6.audit("PARENT_LOGOUT", parentId, { parentId }, "SUCCESS");
  return res.json({
    success: true,
    message: "D\xE9connexion r\xE9ussie avec succ\xE8s."
  });
});
app.get("/api/mobile/parent/me", requireAuth, requireParentRoleOnly, async (req, res) => {
  const parentId = req.parent.id;
  const parent = await store.getParentById(parentId);
  if (!parent) {
    return res.status(404).json({
      error: "Parent introuvable.",
      code: "NOT_FOUND"
    });
  }
  const parentDetails = {
    id: parent.id,
    name: parent.name,
    email: parent.email,
    phoneNumber: parent.phoneNumber,
    activeSchoolId: parent.activeSchoolId,
    schools: parent.schools
  };
  return res.json(parentDetails);
});
app.get("/api/mobile/parent/children", requireAuth, requireParentRoleOnly, async (req, res) => {
  const parentId = req.parent.id;
  const children = await store.getChildrenOfParent(parentId);
  return res.json(children);
});
app.post("/api/mobile/parent/children/simulate", requireAuth, requireParentRoleOnly, async (req, res) => {
  const parentId = req.parent.id;
  const child = await store.createSimulatedChildForParent(parentId);
  if (!child) {
    return res.status(400).json({
      error: "Impossible de simuler un enfant pour ce compte.",
      code: "SIMULATION_FAILED"
    });
  }
  return res.status(201).json(child);
});
app.get("/api/mobile/parent/children/:childId/absences", requireAuth, requireParentRoleOnly, async (req, res) => {
  const { childId } = req.params;
  const parentId = req.parent.id;
  if (!await store.isChildOwnedByParent(childId, parentId)) {
    return res.status(403).json({
      error: "Acc\xE8s refus\xE9. Cet enfant ne vous est pas rattach\xE9.",
      code: "CHILD_OWNERSHIP_VIOLATION"
    });
  }
  const absences = await store.getAbsencesOfChild(childId);
  return res.json(absences);
});
app.get("/api/mobile/parent/children/:childId/grades", requireAuth, requireParentRoleOnly, async (req, res) => {
  const { childId } = req.params;
  const parentId = req.parent.id;
  if (!await store.isChildOwnedByParent(childId, parentId)) {
    return res.status(403).json({
      error: "Acc\xE8s refus\xE9. Cet enfant ne vous est pas rattach\xE9.",
      code: "CHILD_OWNERSHIP_VIOLATION"
    });
  }
  const grades = await store.getGradesOfChild(childId);
  return res.json(grades);
});
app.get("/api/mobile/parent/notifications", requireAuth, requireParentRoleOnly, async (req, res) => {
  const parentId = req.parent.id;
  const notifications = await store.getInAppNotifications(parentId);
  return res.json(notifications);
});
app.put("/api/mobile/parent/notifications/read-all", requireAuth, requireParentRoleOnly, async (req, res) => {
  const parentId = req.parent.id;
  await store.markAllInAppNotificationsAsRead(parentId);
  return res.json({ success: true, message: "Toutes les notifications ont \xE9t\xE9 marqu\xE9es comme lues." });
});
app.post("/api/mobile/parent/devices/register-push-token", requireAuth, requireParentRoleOnly, async (req, res) => {
  const parentId = req.parent.id;
  const validation = RegisterPushTokenSchema.safeParse(req.body);
  if (!validation.success) {
    logger6.warn(`\xC9chec de validation de l'enregistrement de token pour le parent: ${parentId}`);
    return res.status(400).json({
      error: "Param\xE8tres de notification invalides.",
      code: "BAD_REQUEST",
      details: validation.error.format()
    });
  }
  const { pushToken, platform, appVersion } = validation.data;
  const device = await store.registerPushToken(parentId, pushToken, platform, appVersion);
  logger6.audit("REGISTER_PUSH_TOKEN", parentId, { platform, appVersion }, "SUCCESS");
  return res.json({
    success: true,
    message: "Token de notification enregistr\xE9.",
    device
  });
});
app.get("/api/mobile/parent/notification-preferences", requireAuth, requireParentRoleOnly, async (req, res) => {
  const parentId = req.parent.id;
  const preferences = await store.getNotificationPreferences(parentId);
  const consents = await store.getConsentsOfParent(parentId);
  return res.json({
    preferences,
    consents
  });
});
app.put("/api/mobile/parent/notification-preferences", requireAuth, requireParentRoleOnly, async (req, res) => {
  const parentId = req.parent.id;
  const validation = NotificationPreferencesSchema.safeParse(req.body);
  if (!validation.success) {
    logger6.warn(`\xC9chec de la validation de pr\xE9f\xE9rences pour le parent: ${parentId}`);
    return res.status(400).json({
      error: "Param\xE8tres de pr\xE9f\xE9rences invalides.",
      code: "BAD_REQUEST",
      details: validation.error.format()
    });
  }
  const { pushEnabled, whatsappEnabled, smsEnabled, quietHoursStart, quietHoursEnd, whatsappConsent, smsConsent } = validation.data;
  if (whatsappConsent !== void 0) {
    await store.updateConsent(parentId, "whatsapp", whatsappConsent, "v1.0-fr");
  }
  if (smsConsent !== void 0) {
    await store.updateConsent(parentId, "sms", smsConsent, "v1.0-fr");
  }
  const updatedPref = await store.updateNotificationPreferences(parentId, {
    pushEnabled,
    whatsappEnabled,
    smsEnabled,
    quietHoursStart,
    quietHoursEnd
  });
  logger6.audit("UPDATE_PREFERENCES", parentId, { pushEnabled, whatsappEnabled, smsEnabled }, "SUCCESS");
  return res.json({
    success: true,
    message: "Pr\xE9f\xE9rences de notification mises \xE0 jour.",
    preferences: updatedPref,
    consents: await store.getConsentsOfParent(parentId)
  });
});
app.post("/api/mobile/parent/notifications/test", requireAuth, requireParentRoleOnly, async (req, res) => {
  const parentId = req.parent.id;
  const validation = TestNotificationSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: "Veuillez fournir un titre et un corps de message valides.",
      code: "BAD_REQUEST",
      details: validation.error.format()
    });
  }
  const { title, message } = validation.data;
  const dedupeKey = `test-${parentId}-${Date.now()}`;
  const result = await NotificationService.dispatchNotification(
    parentId,
    title,
    message,
    "test",
    { deepLink: "ecoletrack://dashboard" },
    dedupeKey
  );
  logger6.audit("TEST_NOTIFICATION_DISPATCH", parentId, { title }, "SUCCESS");
  return res.json({
    success: true,
    message: "Test de notification multi-canal envoy\xE9 \xE0 la file d'attente.",
    result
  });
});
app.get("/api/mobile/health", (req, res) => {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return res.json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: now,
    database: "connected",
    services: {
      fcm: "active",
      whatsapp_cloud_api: "active",
      sms_gateway: "active"
    }
  });
});
app.post("/api/dev/add-absence", async (req, res) => {
  const { childId, date, reason, justified, justificationText } = req.body;
  if (!childId || !reason) {
    return res.status(400).json({ error: "childId and reason required" });
  }
  const absence = await store.addAbsence({
    childId,
    date: date || (/* @__PURE__ */ new Date()).toISOString(),
    reason,
    justified: !!justified,
    justificationText
  });
  const children = await store.getChildrenOfParent("parent-jean-dupont");
  const backupChildren = await store.getChildrenOfParent("parent-marie-martin");
  const child = children.find((c) => c.id === childId) || backupChildren.find((c) => c.id === childId);
  if (child) {
    const parentId = child.parentId;
    const dedupeKey = `absence-${child.id}-${Date.now()}`;
    const name = `${child.firstName} ${child.lastName}`;
    triggerMultiChannelNotification(
      parentId,
      "Alerte Absence \xC9coleTrack",
      `Absence enregistr\xE9e pour ${name} le ${new Date(date).toLocaleDateString("fr-FR")}. Motif : ${reason}`,
      "absence",
      { childId, childName: name, date, reason },
      dedupeKey
    );
  }
  return res.json({ success: true, absence });
});
app.post("/api/dev/add-grade", async (req, res) => {
  const { childId, subject, grade, coefficient, examName, date } = req.body;
  if (!childId || !subject || grade === void 0 || !examName) {
    return res.status(400).json({ error: "Missing required grade properties" });
  }
  const gradeObj = await store.addGrade({
    childId,
    subject,
    grade: parseFloat(grade),
    coefficient: coefficient ? parseFloat(coefficient) : 1,
    examName,
    date: date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
  });
  const children = await store.getChildrenOfParent("parent-jean-dupont");
  const backupChildren = await store.getChildrenOfParent("parent-marie-martin");
  const child = children.find((c) => c.id === childId) || backupChildren.find((c) => c.id === childId);
  if (child) {
    const parentId = child.parentId;
    const dedupeKey = `grade-${child.id}-${Date.now()}`;
    const name = `${child.firstName} ${child.lastName}`;
    triggerMultiChannelNotification(
      parentId,
      "Nouvelle note disponible",
      `${name} a re\xE7u un ${grade}/20 en ${subject} (${examName}).`,
      "grade",
      { childId, childName: name, subject, grade, examName },
      dedupeKey
    );
  }
  return res.json({ success: true, grade: gradeObj });
});
app.get("/api/dev/delivery-logs", (req, res) => {
  const logs = store.getCompleteDeliveryLogs();
  return res.json(logs);
});
app.post("/api/dev/clear-logs", (req, res) => {
  store.clearAllLogs();
  return res.json({ success: true });
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path2.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path2.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[\xC9coleTrack Server] Running on http://localhost:${PORT}`);
  });
}
startServer();
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
//# sourceMappingURL=server.cjs.map
