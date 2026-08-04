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
var import_crypto2 = __toESM(require("crypto"), 1);
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
    gender: row.gender ?? void 0,
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
      SELECT u.id AS user_id, u.email, u.name, u.role, p.phone, u.school_id, la.password_hash, la.salt, la.must_reset
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
      salt: row.salt ?? void 0,
      mustReset: row.must_reset == null ? void 0 : Boolean(row.must_reset)
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
  async getParentIdsForChildren(childIds) {
    const numericChildIds = childIds.map((childId) => Number(childId)).filter((childId) => Number.isInteger(childId) && childId > 0);
    if (numericChildIds.length === 0) return [];
    const { rows } = await dbQuery(`
      SELECT DISTINCT p.user_id AS parent_user_id
      FROM students s
      JOIN parents p ON p.id = s.parent_id
      WHERE s.id = ANY($1::int[])
    `, [numericChildIds]);
    return rows.map((row) => String(row.parent_user_id)).filter(Boolean);
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
  async justifyAbsence(absenceId, parentId, justificationReason) {
    const { rows } = await dbQuery(`
      UPDATE absences AS a
      SET justified = true,
          justification_text = $1
      FROM children AS c
      WHERE a.id = $2
        AND a.child_id = c.id
        AND c.parent_id = $3
      RETURNING a.id, a.child_id, a.date, a.reason, a.justified, a.justification_text
    `, [justificationReason, absenceId, parentId]);
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: String(row.id),
      childId: String(row.child_id),
      date: row.date,
      reason: row.reason,
      justified: row.justified,
      justificationText: row.justification_text ?? void 0
    };
  }
  async addGrade(grade) {
    const childIds = Array.isArray(grade.childIds) ? grade.childIds : [grade.childId];
    const normalizedChildIds = childIds.map((childId) => Number(childId)).filter((childId) => Number.isInteger(childId) && childId > 0);
    if (normalizedChildIds.length === 0) {
      throw new Error("Invalid child id for grade insertion");
    }
    const firstChildIdNum = normalizedChildIds[0];
    const studentRow = await dbQuery(`SELECT class_id FROM students WHERE id = $1`, [firstChildIdNum]);
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
    const insertedGradeIds = [];
    for (const childIdNum of normalizedChildIds) {
      const { rows } = await dbQuery(`
        INSERT INTO grades (evaluation_id, student_id, score, remarks, edit_count, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 0, NOW(), NOW())
        RETURNING id
      `, [evaluationId, childIdNum, String(grade.grade), "", 0]);
      insertedGradeIds.push(String(rows[0]?.id ?? 0));
    }
    return {
      id: insertedGradeIds[0] ?? "0",
      ...grade
    };
  }
  async getGradesOfChild(childId) {
    const childIdNum = Number(childId);
    if (!Number.isInteger(childIdNum)) return [];
    const { rows } = await dbQuery(`
      SELECT g.id, e.subject, g.score, e.coefficient, e.title, e.date, e.max_score
      FROM grades g
      JOIN evaluations e ON e.id = g.evaluation_id
      WHERE g.student_id = $1
    `, [childIdNum]);
    return rows.map((row) => {
      const rawScore = Number(row.score);
      const maxScore = row.max_score || 20;
      const normalizedScore = rawScore / maxScore * 20;
      return {
        id: String(row.id),
        childId,
        subject: row.subject,
        // `grade` is the normalized score on a /20 scale (backward compatible)
        grade: normalizedScore,
        // Keep original max score to allow clients to display raw values
        maxScore,
        // Expose the raw recorded score so clients can detect double-normalization
        rawScore,
        coefficient: Number(row.coefficient ?? 1),
        examName: row.title,
        date: row.date
      };
    });
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
    try {
      logger.debug(`Fetched ${rows.length} notifications for parent=${parentId}`, { notifications: rows.map((r) => ({ id: r.id, is_read: r.is_read })) });
    } catch (e) {
    }
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
    const result = await dbQuery(`
      UPDATE notifications
      SET is_read = true
      WHERE user_id = $1
    `, [userId]);
    try {
      logger.info(`Marked all notifications as read for parent=${parentId}`, { rowCount: result.rowCount });
    } catch (e) {
    }
  }
  async markInAppNotificationAsRead(parentId, notificationId) {
    const userId = Number(parentId);
    const notifId = Number(notificationId);
    if (!Number.isInteger(userId) || !Number.isInteger(notifId)) return;
    try {
      logger.info(`PUT mark notification read`, { parentId: userId, notificationId: notifId });
    } catch (e) {
    }
    const result = await dbQuery(`
      UPDATE notifications
      SET is_read = true
      WHERE user_id = $1 AND id = $2
    `, [userId, notifId]);
    try {
      logger.info(`Update result for notification`, { parentId: userId, notificationId: notifId, rowCount: result.rowCount });
    } catch (e) {
    }
    try {
      const check = await dbQuery(`
        SELECT is_read
        FROM notifications
        WHERE user_id = $1 AND id = $2
      `, [userId, notifId]);
      logger.info(`Post-update is_read value`, { parentId: userId, notificationId: notifId, is_read: check.rows[0]?.is_read });
    } catch (e) {
      logger.error("Error while checking is_read after update", e, { parentId: userId, notificationId: notifId });
    }
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
  async registerPushToken(parentId, deviceId, token, platform, appVersion) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: existingRows } = await client.query(`
        SELECT id, push_token
        FROM mobile_parent_devices
        WHERE parent_id = $1
          AND platform = $2
          AND device_id = $3
      `, [parentId, platform, deviceId]);
      let rowId = null;
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const oldAssociationsDeleteResult = await client.query(`
        DELETE FROM mobile_parent_devices
        WHERE push_token = $1
          AND parent_id IS DISTINCT FROM $2
      `, [token, parentId]);
      if (oldAssociationsDeleteResult.rowCount > 0) {
        logger.info("Removed stale FCM token associations for other parents", {
          parentId,
          token,
          deleted: oldAssociationsDeleteResult.rowCount
        });
      }
      if (existingRows.length > 0) {
        const existingRow = existingRows[0];
        if (existingRow.push_token !== token) {
          logger.info("Replacing existing FCM token for parent/device", { parentId, deviceId, platform, oldToken: existingRow.push_token, newToken: token });
        } else {
          logger.info("Refreshing existing FCM token metadata for parent/device", { parentId, deviceId, platform, token });
        }
        const updateResult = await client.query(`
          UPDATE mobile_parent_devices
          SET push_token = $1,
              app_version = $2,
              last_seen_at = NOW()
          WHERE id = $3
          RETURNING id
        `, [token, appVersion, existingRow.id]);
        rowId = updateResult.rows[0]?.id ?? existingRow.id;
      } else {
        logger.info("Registering new FCM token for parent/device", { parentId, deviceId, platform, token });
        const insertResult = await client.query(`
          INSERT INTO mobile_parent_devices 
            (parent_id, device_id, platform, push_token, app_version, last_seen_at)
          VALUES ($1, $2, $3, $4, $5, NOW())
          RETURNING id
        `, [parentId, deviceId, platform, token, appVersion]);
        rowId = insertResult.rows[0]?.id ?? null;
      }
      await client.query("COMMIT");
      return {
        id: String(rowId ?? 0),
        parentId,
        platform,
        pushToken: token,
        appVersion,
        lastSeenAt: now
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async getDevicesOfParent(parentId) {
    const { rows } = await dbQuery(`
      SELECT id, platform, push_token, app_version, last_seen_at
      FROM mobile_parent_devices
      WHERE parent_id = $1
      ORDER BY last_seen_at DESC
    `, [parentId]);
    console.log("DEVICES FOUND :", rows);
    return rows.map((row) => ({
      id: String(row.id),
      parentId,
      platform: row.platform,
      pushToken: row.push_token,
      appVersion: row.app_version,
      lastSeenAt: row.last_seen_at
    }));
  }
  async deletePushToken(parentId, token, deviceId) {
    if (!token && !deviceId) {
      return;
    }
    const conditions = ["parent_id = $1"];
    const values = [parentId];
    if (token) {
      conditions.push(`push_token = $${values.length + 1}`);
      values.push(token);
    }
    if (deviceId) {
      conditions.push(`device_id = $${values.length + 1}`);
      values.push(deviceId);
    }
    const result = await dbQuery(
      `DELETE FROM mobile_parent_devices WHERE ${conditions.join(" AND ")}`,
      values
    );
    if (result.rowCount > 0) {
      logger.info("Deleted FCM token association", { parentId, token, deviceId, deleted: result.rowCount });
    } else {
      logger.warn("Attempted to delete FCM token association but no matching row was found", { parentId, token, deviceId });
    }
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

// backend/services/fcm.ts
var import_app = require("firebase-admin/app");
var import_messaging = require("firebase-admin/messaging");
var fs = __toESM(require("fs"), 1);
var path2 = __toESM(require("path"), 1);
var logger4 = new Logger("FCMService");
var serviceAccount = process.env.FCM_SERVICE_ACCOUNT_JSON ? JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON) : JSON.parse(
  fs.readFileSync(
    path2.join(process.cwd(), "config", "firebase-service-account.json"),
    "utf8"
  )
);
console.log("[FCM TEST] project:", serviceAccount.project_id);
console.log("[FCM TEST] email:", serviceAccount.client_email);
console.log("[FCM TEST KEY]", !!serviceAccount.private_key);
(0, import_app.initializeApp)({
  credential: (0, import_app.cert)(serviceAccount)
});
var InvalidFcmTokenError = class _InvalidFcmTokenError extends Error {
  constructor(token, originalError) {
    super(`Invalid FCM registration token: ${token}`);
    this.token = token;
    this.originalError = originalError;
    Object.setPrototypeOf(this, _InvalidFcmTokenError.prototype);
  }
};
function isInvalidFcmTokenError(error) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const rawCode = error.code ?? error?.errorInfo?.code ?? "";
  const code = typeof rawCode === "string" ? rawCode.toLowerCase() : "";
  const message = String(error.message ?? "").toLowerCase();
  const invalidCodes = /* @__PURE__ */ new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
    "registration-token-not-registered",
    "invalid-registration-token",
    "notregistered",
    "unregistered"
  ]);
  if (invalidCodes.has(code)) {
    return true;
  }
  if (message.includes("invalid-registration-token")) {
    return true;
  }
  if (message.includes("registration-token-not-registered")) {
    return true;
  }
  if (message.includes("registration token") && message.includes("not registered")) {
    return true;
  }
  if (message.includes("notregistered")) {
    return true;
  }
  return false;
}
async function sendPushNotification(token, title, body, target = "home") {
  const maskedToken = token ? `${token.slice(0, 10)}...` : "<missing>";
  logger4.info("[NOTIF_TRACE] sendPushNotification start", { token: maskedToken, title, body, target });
  const message = {
    token,
    notification: {
      title,
      body
    },
    data: {
      title,
      body,
      target
    },
    android: {
      priority: "high",
      notification: {
        channelId: "ecoletrack_notifications",
        defaultSound: true,
        defaultVibrateTimings: true,
        visibility: "public"
      }
    }
  };
  try {
    logger4.info("[NOTIF_TRACE] sendPushNotification payload", { token: maskedToken, title, body, target });
    const response = await (0, import_messaging.getMessaging)().send(message);
    logger4.info("[NOTIF_TRACE] sendPushNotification response", { messageId: response });
    logger4.info("[FCM] Succ\xE8s", { messageId: response });
    return response;
  } catch (error) {
    logger4.error("[NOTIF_TRACE] sendPushNotification error", error, {
      code: error?.code,
      message: error?.message,
      errorInfo: error?.errorInfo,
      token: maskedToken
    });
    if (isInvalidFcmTokenError(error)) {
      logger4.error("[FCM] Invalid token detected", error, { token: maskedToken });
      throw new InvalidFcmTokenError(token, error);
    }
    logger4.error("[FCM] Erreur", error, { token: maskedToken });
    throw error;
  }
}

// backend/jobs/queue.ts
var logger5 = new Logger("QueueProcessor");
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
    const jobData = data;
    const parentId = jobData?.parentId;
    const token = jobData?.token;
    const maskedToken = token ? `${String(token).slice(0, 10)}...` : void 0;
    logger5.info("[NOTIF_TRACE] addJob", {
      jobName: name,
      parentId,
      tokenPresent: Boolean(token),
      token: maskedToken,
      title: jobData?.title,
      message: jobData?.message,
      priority,
      dedupeKey
    });
    if (dedupeKey && completedJobIds.has(dedupeKey)) {
      logger5.info(`Idempotency hit! Job with dedupeKey '${dedupeKey}' already processed. Skipping duplicate entry.`);
      return `skipped-${dedupeKey}`;
    }
    if (dedupeKey && activeQueue.some((j) => j.dedupeKey === dedupeKey)) {
      logger5.info(`Job with dedupeKey '${dedupeKey}' is already active in queue. Ignoring duplicate entry.`);
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
    logger5.info(`Job added to queue: ${name} [ID: ${job.id}]`, { jobId: job.id, priority, dedupeKey });
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
    const jobData = job.data;
    const maskedToken = jobData?.token ? `${String(jobData.token).slice(0, 10)}...` : void 0;
    logger5.info("[NOTIF_TRACE] processNextJob start", {
      jobId: job.id,
      jobName: job.name,
      parentId: jobData?.parentId,
      tokenPresent: Boolean(jobData?.token),
      token: maskedToken,
      title: jobData?.title,
      message: jobData?.message,
      attempt: job.attempts + 1,
      maxAttempts: job.maxAttempts
    });
    logger5.info(`Processing Job: ${job.name} [ID: ${job.id}, Attempt: ${job.attempts + 1}/${job.maxAttempts}]`);
    try {
      job.attempts++;
      await this.executeJobLogic(job);
      if (job.dedupeKey) {
        completedJobIds.add(job.dedupeKey);
      }
      logger5.info(`Job completed successfully: ${job.name} [ID: ${job.id}]`);
    } catch (err) {
      const errorMessage = err?.message || String(err);
      job.errorHistory.push({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        message: errorMessage
      });
      if (err instanceof InvalidFcmTokenError) {
        const invalidToken = err.token;
        const parentId = job.data?.parentId;
        logger5.warn(`Invalid FCM token detected, removing it and not retrying job: ${job.name} [ID: ${job.id}]`, {
          jobId: job.id,
          token: invalidToken,
          parentId,
          error: err.originalError
        });
        if (parentId) {
          try {
            await store.deletePushToken(parentId, invalidToken);
            logger5.info(`Invalid FCM token removed from database`, { parentId, token: invalidToken });
          } catch (deleteError) {
            logger5.error(`Failed to delete invalid FCM token from database`, deleteError, { parentId, token: invalidToken });
          }
        }
        if (job.dedupeKey) {
          completedJobIds.add(job.dedupeKey);
        }
        return;
      }
      const jobData2 = job.data;
      const maskedToken2 = jobData2?.token ? `${String(jobData2.token).slice(0, 10)}...` : void 0;
      logger5.error(`Job execution failed: ${job.name} [ID: ${job.id}]`, err, {
        jobId: job.id,
        jobName: job.name,
        parentId: jobData2?.parentId,
        token: maskedToken2,
        title: jobData2?.title,
        message: jobData2?.message,
        attempts: job.attempts,
        errorHistory: job.errorHistory
      });
      if (job.attempts < job.maxAttempts) {
        const delay = Math.pow(2, job.attempts) * 100;
        logger5.warn(`Scheduling retry for job: ${job.id} in ${delay}ms...`);
        setTimeout(() => {
          activeQueue.push(job);
          activeQueue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
          this.processNextJob();
        }, delay);
      } else {
        logger5.error(`Job failed maximum attempts: ${job.name} [ID: ${job.id}]. Moving to DLQ.`);
        deadLetterQueue.push(job);
        logger5.audit("JOB_DLQ_ROUTED", "QueueProcessor", { jobId: job.id, jobName: job.name, errors: job.errorHistory }, "FAILURE");
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
    const jobData = job.data;
    const maskedToken = jobData?.token ? `${String(jobData.token).slice(0, 10)}...` : void 0;
    logger5.info("[NOTIF_TRACE] executeJobLogic started", {
      jobName: job.name,
      jobId: job.id,
      parentId: jobData?.parentId,
      tokenPresent: Boolean(jobData?.token),
      token: maskedToken,
      title: jobData?.title,
      message: jobData?.message,
      target: jobData?.target
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (job.name.startsWith("send-notification-push")) {
        const {
          token,
          title,
          message,
          target = "home"
        } = job.data;
        if (!token) {
          throw new Error("FCM token missing");
        }
        const tokenPreview = token ? `${String(token).slice(0, 10)}...` : void 0;
        logger5.info("[NOTIF_TRACE] About to call sendPushNotification", { parentId: jobData?.parentId, jobId: job.id, token: tokenPreview, title, message, target });
        await sendPushNotification(
          token,
          title,
          message,
          target
        );
        logger5.info("[NOTIF_TRACE] FCM envoy\xE9 avec succ\xE8s", { token: tokenPreview, title, target });
        logger5.info("Push notification sent successfully", {
          title
        });
        return;
      }
      if (job.name.startsWith("send-notification-whatsapp")) {
        logger5.info("WhatsApp delivery placeholder");
        return;
      }
      if (job.name.startsWith("send-notification-sms")) {
        logger5.info("SMS delivery placeholder");
        return;
      }
      if (job.name === "test-failure-simulation") {
        throw new Error(
          "Network timeout: FCM Gateway failed to respond"
        );
      }
    } catch (err) {
      logger5.error("[NOTIF_TRACE] executeJobLogic error", err, {
        jobId: job.id,
        jobName: job.name,
        parentId: jobData?.parentId,
        token: maskedToken,
        title: jobData?.title,
        message: jobData?.message
      });
      throw err;
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
var logger6 = new Logger("NotificationService");
var NotificationService = class {
  /**
   * Orchestrates multi-channel delivery based on parent consents and quiet hours
   */
  static async dispatchNotification(parentId, title, message, category, metadata = {}, dedupeKey) {
    logger6.info("[NOTIF_TRACE] dispatchNotification start", { parentId, category, title, dedupeKey, metadata });
    const effectiveParentIds = await this.resolveParentIds(parentId, metadata);
    logger6.info(`Orchestrating notification for Parent IDs: ${effectiveParentIds.join(", ") || "<none>"}`, { category, dedupeKey });
    logger6.info("[NOTIF_TRACE] parentIds r\xE9solus", { effectiveParentIds });
    if (effectiveParentIds.length === 0) {
      logger6.warn("No parent IDs resolved for notification dispatch.");
      logger6.info("[TRACE] dispatchNotification exited early: no parent IDs resolved");
      return {
        success: true,
        channels: [],
        jobs: []
      };
    }
    const jobsTriggered = [];
    const channelsToDeliver = [];
    for (const effectiveParentId of effectiveParentIds) {
      const preferences = await store.getNotificationPreferences(effectiveParentId);
      logger6.info("[NOTIF_TRACE] Notification preferences loaded", { parentId: effectiveParentId, preferences });
      const consents = await store.getConsentsOfParent(effectiveParentId);
      logger6.info("[NOTIF_TRACE] Notification consents loaded", { parentId: effectiveParentId, consents });
      const devices = await store.getDevicesOfParent(effectiveParentId);
      const deviceSummaries = devices.map((device) => ({
        id: device.id,
        platform: device.platform,
        tokenPresent: Boolean(device.pushToken),
        tokenPreview: device.pushToken ? `${device.pushToken.slice(0, 10)}...` : void 0,
        appVersion: device.appVersion
      }));
      logger6.info("[NOTIF_TRACE] Notification devices loaded", { parentId: effectiveParentId, deviceCount: devices.length, devices: deviceSummaries });
      const isPushAuthorized = preferences.pushEnabled;
      const isSmsAuthorized = preferences.smsEnabled && consents.some((c) => c.channel === "sms" && c.consentGranted);
      const isWhatsappAuthorized = preferences.whatsappEnabled && consents.some((c) => c.channel === "whatsapp" && c.consentGranted);
      if (this.isWithinQuietHours(preferences.quietHoursStart, preferences.quietHoursEnd)) {
        logger6.info(`Quiet Hours active for parent ${effectiveParentId}. Scheduling notification with lower priority or buffering.`);
        metadata.quietHoursApplied = true;
      }
      const pushTokens = Array.from(new Set(
        devices.map((device) => device.pushToken).filter((token) => Boolean(token))
      ));
      logger6.info("Devices found", { parentId: effectiveParentId, devices });
      logger6.info("[TRACE] Push tokens resolved", { parentId: effectiveParentId, pushTokens });
      if (pushTokens.length === 0 && isPushAuthorized) {
        logger6.warn(`No devices registered for parent: ${effectiveParentId}. Push skipped.`);
      }
      const parentChannelsToDeliver = [];
      if (isPushAuthorized && pushTokens.length > 0) {
        parentChannelsToDeliver.push("push");
      }
      const target = typeof metadata?.target === "string" && metadata.target.trim().length > 0 ? metadata.target : "home";
      if (isWhatsappAuthorized) {
        parentChannelsToDeliver.push("whatsapp");
      }
      if (isSmsAuthorized) {
        parentChannelsToDeliver.push("sms");
      }
      if (parentChannelsToDeliver.length === 0) {
        logger6.warn(
          `No delivery channels available for parent: ${effectiveParentId}. In-app notification only.`
        );
      }
      for (const channel of parentChannelsToDeliver) {
        const priority = category === "absence" ? 10 : 5;
        const jobName = `send-notification-${channel}`;
        if (channel === "push") {
          for (const token of pushTokens) {
            const jobDedupeKey = dedupeKey ? `${dedupeKey}-${channel}-${token}` : void 0;
            const tokenPreview = token ? `${token.slice(0, 10)}...` : void 0;
            logger6.info("[NOTIF_TRACE] QueueManager.addJob preparing", { channel, tokenPresent: Boolean(token), token: tokenPreview, jobName, dedupeKey: jobDedupeKey });
            const jobId = QueueManager.addJob(jobName, {
              parentId: effectiveParentId,
              channel,
              title,
              message,
              category,
              metadata,
              target,
              token
            }, {
              priority,
              dedupeKey: jobDedupeKey,
              maxAttempts: 3
            });
            logger6.info("[NOTIF_TRACE] QueueManager.addJob queued", { jobName, jobId, parentId: effectiveParentId, channel, dedupeKey: jobDedupeKey, tokenPresent: Boolean(token), token: tokenPreview });
            jobsTriggered.push(jobId);
          }
        } else {
          const jobDedupeKey = dedupeKey ? `${dedupeKey}-${channel}` : void 0;
          logger6.info("[NOTIF_TRACE] QueueManager.addJob preparing", { channel, tokenPresent: false, jobName, dedupeKey: jobDedupeKey });
          const jobId = QueueManager.addJob(jobName, {
            parentId: effectiveParentId,
            channel,
            title,
            message,
            category,
            metadata,
            token: void 0
          }, {
            priority,
            dedupeKey: jobDedupeKey,
            maxAttempts: 3
          });
          logger6.info("[NOTIF_TRACE] QueueManager.addJob queued", { jobName, jobId, parentId: effectiveParentId, channel, dedupeKey: jobDedupeKey, tokenPresent: false });
          jobsTriggered.push(jobId);
        }
      }
      parentChannelsToDeliver.forEach((channel) => channelsToDeliver.push(channel));
    }
    const result = {
      success: true,
      channels: Array.from(new Set(channelsToDeliver)),
      jobs: jobsTriggered
    };
    logger6.info("[TRACE] dispatchNotification completed", { channels: result.channels, jobs: result.jobs });
    return result;
  }
  static async resolveParentIds(parentId, metadata = {}) {
    if (Array.isArray(parentId)) {
      return parentId.filter((value) => typeof value === "string" && value.trim().length > 0);
    }
    if (typeof parentId === "string" && parentId.trim().length > 0) {
      return [parentId];
    }
    if (Array.isArray(metadata?.parentIds)) {
      return metadata.parentIds.map((value) => typeof value === "string" ? value : String(value)).filter((value) => value.trim().length > 0);
    }
    if (Array.isArray(metadata?.childIds) && metadata.childIds.length > 0) {
      return store.getParentIdsForChildren(metadata.childIds);
    }
    return [];
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
      logger6.error("Failed to parse quiet hours, skipping window validation", e);
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
  appVersion: import_zod.z.string().min(1, { message: "La version de l'application est requise." }),
  deviceId: import_zod.z.string().min(10, { message: "L'identifiant du device est requis." })
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
  message: import_zod.z.string().min(1, { message: "Le message est requis." }),
  target: import_zod.z.string().min(1).optional()
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
var logger7 = new Logger("ExpressServer");
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
  console.log("[AUTH_DEBUG] requireAuth Authorization header:", authHeader);
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("[AUTH_DEBUG] requireAuth missing or invalid Bearer header");
    return res.status(401).json({
      error: "Authentification requise. Jeton de session manquant.",
      code: "UNAUTHORIZED"
    });
  }
  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    console.log("[AUTH_DEBUG] requireAuth token verification failed", { tokenLength: token?.length });
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
  console.log("[AUTH_DEBUG] requireParentRoleOnly parent role:", req.parent?.role, "url:", req.originalUrl);
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
    logger7.warn("\xC9chec de la validation Zod sur la route d'authentification.");
    return res.status(400).json({
      error: "Donn\xE9es de connexion invalides.",
      code: "BAD_REQUEST",
      details: validation.error.format()
    });
  }
  const { email, password } = validation.data;
  const user = await store.findParentByEmail(email);
  if (!user) {
    logger7.warn(`Tentative de connexion infructueuse (utilisateur inconnu): ${email}`);
    return res.status(401).json({
      error: "Identifiants de connexion incorrects.",
      code: "BAD_CREDENTIALS"
    });
  }
  const isPasswordValid = await store.verifyParentPassword(email, password);
  if (!isPasswordValid) {
    logger7.warn(`Mot de passe incorrect pour le compte parent: ${email}`);
    return res.status(401).json({
      error: "Identifiants de connexion incorrects.",
      code: "BAD_CREDENTIALS"
    });
  }
  if (user.role !== "parent") {
    logger7.audit("NON_PARENT_LOGIN_REJECT", user.id, { email, role: user.role }, "FAILURE");
    return res.status(403).json({
      error: "Acc\xE8s mobile r\xE9serv\xE9 aux parents.",
      code: "PARENTS_ONLY",
      details: { role: user.role }
    });
  }
  let localMustReset = false;
  if (typeof user.mustReset !== "undefined" && user.mustReset !== null) {
    localMustReset = Boolean(user.mustReset);
  } else if (user.passwordHash && user.salt) {
    try {
      const defaultHash = import_crypto2.default.pbkdf2Sync("123456", user.salt, 31e4, 64, "sha512").toString("hex");
      localMustReset = user.passwordHash === defaultHash;
    } catch {
      localMustReset = false;
    }
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
  logger7.audit("PARENT_LOGIN_SUCCESS", user.id, { email, mustReset: localMustReset }, "SUCCESS");
  return res.json({
    parent: parentDetails,
    token: session.accessToken,
    refreshToken: session.refreshToken,
    mustReset: localMustReset
  });
});
app.post("/api/mobile/parent/change-password", rateLimit(15, 6e4), async (req, res) => {
  const { email, currentPassword, newPassword } = req.body ?? {};
  if (!email || !currentPassword || !newPassword) {
    return res.status(400).json({
      error: "Email, mot de passe actuel et nouveau mot de passe sont requis.",
      code: "BAD_REQUEST"
    });
  }
  if (newPassword === "123456") {
    return res.status(400).json({
      error: "Le nouveau mot de passe ne peut pas \xEAtre le mot de passe par d\xE9faut.",
      code: "INVALID_PASSWORD"
    });
  }
  const user = await store.findParentByEmail(email);
  if (!user) {
    return res.status(401).json({
      error: "Identifiants de connexion incorrects.",
      code: "BAD_CREDENTIALS"
    });
  }
  const currentPasswordValid = await store.verifyParentPassword(email, currentPassword);
  if (!currentPasswordValid) {
    return res.status(401).json({
      error: "Mot de passe actuel incorrect.",
      code: "BAD_CREDENTIALS"
    });
  }
  if (!user.salt) {
    return res.status(500).json({
      error: "Impossible de changer le mot de passe pour ce compte.",
      code: "INTERNAL_ERROR"
    });
  }
  const newSalt = import_crypto2.default.randomBytes(16).toString("hex");
  const newHash = import_crypto2.default.pbkdf2Sync(newPassword, newSalt, 31e4, 64, "sha512").toString("hex");
  await dbQuery(`UPDATE local_auths SET password_hash = $1, salt = $2, must_reset = false WHERE user_id = $3`, [newHash, newSalt, Number(user.id)]);
  logger7.audit("PARENT_CHANGE_PASSWORD", user.id, { email }, "SUCCESS");
  return res.json({ success: true });
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
    logger7.warn("\xC9chec de rotation du Jeton de Rafra\xEEchissement. Token expir\xE9, compromis ou invalide.");
    return res.status(401).json({
      error: "Session invalide ou expir\xE9e. Veuillez vous reconnecter.",
      code: "INVALID_SESSION"
    });
  }
  logger7.info("Rotation du jeton de session effectu\xE9e avec succ\xE8s.");
  return res.json(newSession);
});
app.post("/api/mobile/parent/logout", requireAuth, requireParentRoleOnly, async (req, res) => {
  const parentId = req.parent.id;
  const { refreshToken, deviceId, pushToken } = req.body ?? {};
  if (refreshToken) {
    AuthService.revokeSession(parentId, refreshToken);
  } else {
    AuthService.revokeAllSessions(parentId);
  }
  if (pushToken || deviceId) {
    await store.deletePushToken(parentId, typeof pushToken === "string" ? pushToken : void 0, typeof deviceId === "string" ? deviceId : void 0);
  }
  logger7.audit("PARENT_LOGOUT", parentId, { parentId, deviceId: typeof deviceId === "string" ? deviceId : void 0 }, "SUCCESS");
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
app.put("/api/absences/:absenceId/justify", requireAuth, requireParentRoleOnly, async (req, res) => {
  const { absenceId } = req.params;
  const { justificationReason } = req.body;
  const parentId = req.parent.id;
  if (typeof justificationReason !== "string" || !justificationReason.trim()) {
    return res.status(400).json({
      error: "Veuillez fournir un motif de justification.",
      code: "JUSTIFICATION_REQUIRED"
    });
  }
  try {
    const updatedAbsence = await store.justifyAbsence(absenceId, parentId, justificationReason.trim());
    if (!updatedAbsence) {
      return res.status(404).json({
        error: "Absence introuvable ou non rattach\xE9e \xE0 ce parent.",
        code: "ABSENCE_NOT_FOUND"
      });
    }
    return res.json(updatedAbsence);
  } catch (err) {
    console.error("Failed to justify absence:", err);
    return res.status(500).json({
      error: "Impossible de justifier l'absence pour le moment.",
      code: "INTERNAL_ERROR"
    });
  }
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
  let termAverage = null;
  try {
    const childIdNum = Number(childId);
    const studentResult = await dbQuery(
      `SELECT first_name, last_name, school_id FROM students WHERE id = $1`,
      [childIdNum]
    );
    const studentRow = studentResult.rows[0];
    const studentName = studentRow ? `${studentRow.first_name} ${studentRow.last_name}` : "Unknown";
    const termResult = studentRow?.school_id != null ? await dbQuery(
      `SELECT id, name FROM school_terms WHERE school_id = $1 AND is_active = true ORDER BY order_index DESC LIMIT 1`,
      [studentRow.school_id]
    ) : { rows: [] };
    const activeTerm = termResult.rows[0] ?? null;
    const termName = activeTerm ? activeTerm.name : "Aucun terme actif";
    const rawRows = await dbQuery(
      `SELECT e.id AS evaluation_id, e.term_id, e.subject, e.title, e.coefficient, e.max_score, e.count_in_bulletin,
              e.date, g.id AS grade_id, g.score, g.created_at, g.updated_at
       FROM grades g
       JOIN evaluations e ON e.id = g.evaluation_id
       WHERE g.student_id = $1`,
      [childIdNum]
    );
    const gradesByEvaluation = /* @__PURE__ */ new Map();
    rawRows.rows.forEach((row) => {
      const existing = gradesByEvaluation.get(row.evaluation_id) ?? [];
      existing.push(row);
      gradesByEvaluation.set(row.evaluation_id, existing);
    });
    const usedEvaluations = [];
    const ignoredEvaluations = [];
    let totalWeighted = 0;
    let totalCoefficient = 0;
    if (activeTerm) {
      for (const [evaluationId, rows] of gradesByEvaluation.entries()) {
        const evaluation = rows[0];
        const termMatches = evaluation.term_id === activeTerm.id || evaluation.term_id == null;
        const countInBulletin = evaluation.count_in_bulletin !== false;
        if (!termMatches) {
          ignoredEvaluations.push(`${evaluation.subject} ${evaluation.score}/${evaluation.max_score ?? 20} -> term_id=${evaluation.term_id}`);
          continue;
        }
        if (!countInBulletin) {
          ignoredEvaluations.push(`${evaluation.subject} ${evaluation.score}/${evaluation.max_score ?? 20} -> countInBulletin=false`);
          continue;
        }
        const latestGrade = rows.sort((a, b) => {
          const aTime = new Date(a.updated_at || a.created_at).getTime();
          const bTime = new Date(b.updated_at || b.created_at).getTime();
          return bTime - aTime;
        })[0];
        const rawScore = latestGrade.score.trim().replace(",", ".");
        const rawValue = Number(rawScore);
        if (!Number.isFinite(rawValue)) {
          ignoredEvaluations.push(`${evaluation.subject} ${latestGrade.score} -> invalid raw score`);
          continue;
        }
        const maxScore = Number(evaluation.max_score ?? 20);
        if (!Number.isFinite(maxScore) || maxScore <= 0) {
          ignoredEvaluations.push(`${evaluation.subject} ${rawValue}/${evaluation.max_score} -> invalid maxScore`);
          continue;
        }
        const coefficient = Number(evaluation.coefficient ?? 1);
        if (!Number.isFinite(coefficient) || coefficient <= 0) {
          ignoredEvaluations.push(`${evaluation.subject} ${rawValue}/${maxScore} -> invalid coefficient`);
          continue;
        }
        const normalizedScore = rawValue / maxScore * 20;
        totalWeighted += normalizedScore * coefficient;
        totalCoefficient += coefficient;
        usedEvaluations.push(`${evaluation.subject} ${rawValue}/${maxScore} coef ${coefficient}`);
      }
      termAverage = totalCoefficient > 0 ? Number((totalWeighted / totalCoefficient).toFixed(2)) : null;
    }
    console.log("[SERVER TERM AVERAGE DEBUG]");
    console.log("[SERVER TERM AVERAGE DEBUG] Student:", studentName);
    console.log("[SERVER TERM AVERAGE DEBUG] Term:", termName);
    console.log("[SERVER TERM AVERAGE DEBUG] USED:");
    usedEvaluations.forEach((line) => console.log("[SERVER TERM AVERAGE DEBUG] " + line));
    console.log("[SERVER TERM AVERAGE DEBUG] IGNORED:");
    ignoredEvaluations.forEach((line) => console.log("[SERVER TERM AVERAGE DEBUG] " + line));
    console.log("[SERVER TERM AVERAGE DEBUG] Average:", termAverage != null ? termAverage.toFixed(2) : "null");
  } catch (e) {
    console.log("[SERVER TERM AVERAGE DEBUG] Failed to compute term average:", String(e));
    termAverage = null;
  }
  return res.json({ grades, termAverage });
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
app.put("/api/mobile/parent/notifications/:id/read", requireAuth, requireParentRoleOnly, async (req, res) => {
  const parentId = req.parent.id;
  const { id } = req.params;
  await store.markInAppNotificationAsRead(parentId, id);
  return res.json({ success: true, message: "Notification marqu\xE9e comme lue." });
});
app.post("/api/mobile/parent/devices/register-push-token", requireAuth, requireParentRoleOnly, async (req, res) => {
  console.log("========== REGISTER PUSH TOKEN ==========");
  console.log("Body re\xE7u :", req.body);
  const parentId = req.parent.id;
  const validation = RegisterPushTokenSchema.safeParse(req.body);
  if (!validation.success) {
    logger7.warn(`\xC9chec de validation de l'enregistrement de token pour le parent: ${parentId}`);
    return res.status(400).json({
      error: "Param\xE8tres de notification invalides.",
      code: "BAD_REQUEST",
      details: validation.error.format()
    });
  }
  const { pushToken, platform, appVersion, deviceId } = validation.data;
  console.log("PUSH TOKEN RECU :", {
    parentId,
    pushToken,
    platform,
    appVersion,
    deviceId
  });
  const device = await store.registerPushToken(
    parentId,
    deviceId,
    pushToken,
    platform,
    appVersion
  );
  console.log("DEVICE ENREGISTRE :", device);
  logger7.audit(
    "REGISTER_PUSH_TOKEN",
    parentId,
    { platform, appVersion },
    "SUCCESS"
  );
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
    logger7.warn(`\xC9chec de la validation de pr\xE9f\xE9rences pour le parent: ${parentId}`);
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
    quietHoursStart: quietHoursStart ?? void 0,
    quietHoursEnd: quietHoursEnd ?? void 0
  });
  logger7.audit("UPDATE_PREFERENCES", parentId, { pushEnabled, whatsappEnabled, smsEnabled }, "SUCCESS");
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
  const { title, message, target } = validation.data;
  const dedupeKey = `test-${parentId}-${Date.now()}`;
  const result = await NotificationService.dispatchNotification(
    parentId,
    title,
    message,
    "test",
    {
      deepLink: "ecoletrack://dashboard",
      ...target ? { target } : {}
    },
    dedupeKey
  );
  logger7.audit("TEST_NOTIFICATION_DISPATCH", parentId, { title }, "SUCCESS");
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
  logger7.info("[NOTIF_TRACE] add-absence endpoint received", { childId, date, reason, justified });
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
  logger7.info("[NOTIF_TRACE] absence created", { childId, absenceId: absence.id, date: absence.date, reason, justified });
  const children = await store.getChildrenOfParent("parent-jean-dupont");
  const backupChildren = await store.getChildrenOfParent("parent-marie-martin");
  const child = children.find((c) => c.id === childId) || backupChildren.find((c) => c.id === childId);
  if (child) {
    const parentId = child.parentId;
    const dedupeKey = `absence-${child.id}-${Date.now()}`;
    const name = `${child.firstName} ${child.lastName}`;
    // Build consistent message body using absence date/time and optional subjectName
    const formatDateSafe = (dateStr) => {
      if (!dateStr) return '';
      const opts = { day: '2-digit', month: '2-digit', year: 'numeric' };
      if (String(dateStr).includes('T')) return new Date(dateStr).toLocaleDateString('fr-FR', opts);
      const parts = String(dateStr).split('-');
      if (parts.length === 3) {
        const y = Number(parts[0]);
        const m = Number(parts[1]) - 1;
        const d = Number(parts[2]);
        return new Date(y, m, d).toLocaleDateString('fr-FR', opts);
      }
      return new Date(dateStr).toLocaleDateString('fr-FR', opts);
    };
    const absenceDate = new Date(absence.date);
    const formattedDate = formatDateSafe(absence.date);
    const timePart = absenceDate.toISOString().includes('T') ? ` de ${absenceDate.toISOString().substr(11,5)}` : '';
    const subjectName = absence.subjectName || undefined;
    const subjectText = subjectName ? `, en ${subjectName}` : '';
    const messageBody = `Une absence a été signalée pour ${child.firstName} le ${formattedDate}${timePart}${subjectText}. Veuillez fournir un justificatif.`;

    const internalPayload = {
      parentId,
      title: `Nouvelle absence pour ${child.firstName}`,
      message: messageBody,
      category: "absence",
      metadata: {
        absenceId: absence.id,
        childId,
        date: absence.date,
        reason,
        subjectName: subjectName
      },
      dedupeKey
    };
    logger7.info("[NOTIF_TRACE] calling /api/internal/absence-notification", {
      parentId,
      childId,
      absenceId: absence.id,
      payload: internalPayload
    });
    const API_URL = process.env.API_URL || "http://localhost:3001";
    logger7.info("[ENV_TRACE] API_URL =", { API_URL, raw: process.env.API_URL });
    await fetch(`${API_URL}/api/internal/absence-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(internalPayload)
    });
  }
  return res.json({ success: true, absence });
});
app.post("/api/dev/add-grade", async (req, res) => {
  const { childId, childIds, subject, grade, coefficient, examName, date } = req.body;
  const requestedChildIds = Array.isArray(childIds) ? childIds.filter((value) => typeof value === "string" && value.trim().length > 0) : childId ? [String(childId)] : [];
  if (requestedChildIds.length === 0 || !subject || grade === void 0 || !examName) {
    return res.status(400).json({ error: "Missing required grade properties" });
  }
  const gradeObj = await store.addGrade({
    childId: requestedChildIds[0],
    subject,
    grade: parseFloat(grade),
    coefficient: coefficient ? parseFloat(coefficient) : 1,
    examName,
    date: date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
  });
  const children = await store.getChildrenOfParent("parent-jean-dupont");
  const backupChildren = await store.getChildrenOfParent("parent-marie-martin");
  const primaryChild = children.find((c) => c.id === requestedChildIds[0]) || backupChildren.find((c) => c.id === requestedChildIds[0]);
  const resolvedParentIds = await store.getParentIdsForChildren(requestedChildIds);
  const notificationParentIds = resolvedParentIds.length > 0 ? resolvedParentIds : primaryChild ? [primaryChild.parentId] : [];
  if (primaryChild) {
    const dedupeKey = `grade-${requestedChildIds[0]}-${Date.now()}`;
    const name = `${primaryChild.firstName} ${primaryChild.lastName}`;
    await NotificationService.dispatchNotification(
      notificationParentIds,
      "Nouvelle note disponible",
      `${name} a re\xE7u un ${grade}/20 en ${subject} (${examName}).`,
      "grade",
      {
        childId: requestedChildIds[0],
        childIds: requestedChildIds,
        parentIds: notificationParentIds,
        childName: name,
        subject,
        grade,
        examName
      },
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
app.post("/api/internal/absence-notification", async (req, res) => {
  try {
    logger7.info("[NOTIF_TRACE] /api/internal/absence-notification route entry", { body: req.body });
    const {
      parentId,
      title,
      message,
      category = "absence",
      metadata = {},
      dedupeKey
    } = req.body;
    logger7.info("[NOTIF_TRACE] /api/internal/absence-notification parsed body", { parentId, title, message, category, metadata, dedupeKey });
    if (!parentId || !title || !message) {
      return res.status(400).json({
        error: "Missing notification parameters"
      });
    }
    logger7.info("[NOTIF_TRACE] /api/internal/absence-notification dispatching", { parentId, title, message, category, metadata, dedupeKey });
    const result = await NotificationService.dispatchNotification(
      String(parentId),
      title,
      message,
      category,
      metadata,
      dedupeKey
    );
    logger7.info("[NOTIF_TRACE] /api/internal/absence-notification dispatch result", { result });
    return res.json({
      success: true,
      result
    });
  } catch (err) {
    logger7.error("Internal absence notification failed", err);
    return res.status(500).json({
      error: "Notification dispatch failed"
    });
  }
});
app.post("/api/internal/grade-notification", async (req, res) => {
  try {
    const {
      parentId,
      title,
      message,
      category = "grade",
      metadata = {},
      dedupeKey
    } = req.body;
    if (!parentId || !title || !message) {
      return res.status(400).json({
        error: "Missing notification parameters"
      });
    }
    const childIds = Array.isArray(metadata?.childIds) ? metadata.childIds.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
    const parentIds = Array.isArray(metadata?.parentIds) ? metadata.parentIds.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
    const resolvedParentIds = parentIds.length > 0 ? parentIds : childIds.length > 0 ? await store.getParentIdsForChildren(childIds) : [String(parentId)];
    const result = await NotificationService.dispatchNotification(
      resolvedParentIds,
      title,
      message,
      category,
      {
        ...metadata,
        childIds,
        parentIds: resolvedParentIds
      },
      dedupeKey
    );
    return res.json({
      success: true,
      result
    });
  } catch (err) {
    logger7.error("Internal grade notification failed", err);
    return res.status(500).json({
      error: "Notification dispatch failed"
    });
  }
});
app.post("/api/internal/evaluation-notification", async (req, res) => {
  console.log("\u{1F4E2} EVALUATION NOTIFICATION RECUE", req.body);
  try {
    const {
      parentId,
      title,
      message,
      category = "evaluation",
      metadata = {},
      dedupeKey
    } = req.body;
    if (!parentId || !title || !message) {
      return res.status(400).json({
        error: "Missing notification parameters"
      });
    }
    const result = await NotificationService.dispatchNotification(
      String(parentId),
      title,
      message,
      category,
      metadata,
      dedupeKey
    );
    return res.json({
      success: true,
      result
    });
  } catch (err) {
    logger7.error("Internal evaluation notification failed", err);
    return res.status(500).json({
      error: "Notification dispatch failed"
    });
  }
});
app.post("/api/internal/info-notification", async (req, res) => {
  console.log("\u{1F4E2} INFO NOTIFICATION RECUE", req.body);
  try {
    const {
      parentId,
      title,
      message,
      category = "info",
      metadata = {},
      dedupeKey
    } = req.body;
    if (!parentId || !title || !message) {
      return res.status(400).json({
        error: "Missing notification parameters"
      });
    }
    const result = await NotificationService.dispatchNotification(
      String(parentId),
      title,
      message,
      category,
      metadata,
      dedupeKey
    );
    return res.json({
      success: true,
      result
    });
  } catch (err) {
    logger7.error("Internal info notification failed", err);
    return res.status(500).json({
      error: "Notification dispatch failed"
    });
  }
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
