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
var import_config = require("dotenv/config");
var import_express = __toESM(require("express"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_crypto2 = __toESM(require("crypto"), 1);
var import_stream = require("stream");
var import_fs2 = require("fs");
var import_multer2 = __toESM(require("multer"), 1);
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
    cycleCode: row.cycleCode ?? null,
    birthDate: row.birthDate ?? "",
    gender: row.gender ?? void 0,
    avatarUrl: row.photoAvailable ? `/api/mobile/parent/children/${row.id}/photo` : ""
  };
}

// backend/absenceJustification.ts
var JUSTIFICATION_ALREADY_REJECTED_CODE = "JUSTIFICATION_ALREADY_REJECTED";
var JUSTIFICATION_ALREADY_REJECTED_MESSAGE = "Cette justification a d\xE9j\xE0 \xE9t\xE9 rejet\xE9e. Veuillez vous rapprocher de l\u2019\xE9tablissement avec les justificatifs n\xE9cessaires.";
var AbsenceJustificationAlreadyRejectedError = class extends Error {
  constructor() {
    super(JUSTIFICATION_ALREADY_REJECTED_MESSAGE);
    this.code = JUSTIFICATION_ALREADY_REJECTED_CODE;
    this.name = "AbsenceJustificationAlreadyRejectedError";
  }
};
var mapParentAbsenceRow = (row, childId) => ({
  id: String(row.id),
  childId: String(row.student_id ?? childId),
  date: row.date,
  reason: row.declaration_id ? "Absence avec d\xE9claration parentale" : row.is_justified ? "Absence justifi\xE9e" : "Absence non justifi\xE9e",
  justified: row.is_justified,
  declarationId: row.declaration_id == null ? void 0 : String(row.declaration_id),
  justificationText: row.justification_reason ?? void 0,
  justificationStatus: row.justification_status ?? null,
  rejectionReason: row.rejection_reason ?? void 0,
  subjectName: row.subject_name ?? void 0,
  startTime: row.start_time ?? void 0,
  endTime: row.end_time ?? void 0,
  period: row.period ?? void 0
});
var submitAbsenceJustificationForReview = async (query, absenceId, parentId, justificationReason) => {
  const { rows } = await query(`
    UPDATE absences AS a
    SET is_justified = false,
        justification_reason = $1,
        justification_status = 'PENDING',
        rejection_reason = NULL,
        reviewed_by = NULL,
        reviewed_at = NULL
    FROM students AS s
    JOIN parents AS p ON p.id = s.parent_id
    WHERE a.id = $2
      AND a.student_id = s.id
      AND p.user_id = $3
      AND a.justification_status IS DISTINCT FROM 'REJECTED'
    RETURNING a.id, a.student_id, a.date, a.is_justified,
      a.justification_reason, a.justification_status, a.rejection_reason
  `, [justificationReason, absenceId, parentId]);
  if (rows.length === 0) {
    const existing = await query(`
      SELECT a.justification_status
      FROM absences AS a
      JOIN students AS s ON s.id = a.student_id
      JOIN parents AS p ON p.id = s.parent_id
      WHERE a.id = $1 AND p.user_id = $2
    `, [absenceId, parentId]);
    if (existing.rows[0]?.justification_status === "REJECTED") {
      throw new AbsenceJustificationAlreadyRejectedError();
    }
    return null;
  }
  return mapParentAbsenceRow(rows[0], rows[0].student_id == null ? "" : String(rows[0].student_id));
};

// backend/parentLogin.ts
var normalizeParentLoginPhone = (value, phoneCountryCode) => {
  const digits = value.replace(/\D/g, "");
  if (!digits) return [];
  const trimmedValue = value.trim();
  if (trimmedValue.startsWith("+")) return [digits];
  if (trimmedValue.startsWith("00")) return [digits.slice(2)];
  const countryCodeDigits = String(phoneCountryCode ?? "").replace(/\D/g, "");
  if (!countryCodeDigits) return [];
  return [`${countryCodeDigits}${digits}`];
};
var selectUniqueParentPhoneMatch = (rows) => {
  const uniqueRows = new Map(rows.map((row) => [String(row.user_id), row]));
  return uniqueRows.size === 1 ? uniqueRows.values().next().value ?? null : null;
};
var authenticateMobileParentLogin = async (identifier, password, phoneCountryCode, store2) => {
  const normalizedIdentifier = identifier.trim();
  if (!normalizedIdentifier) return null;
  const isEmail = normalizedIdentifier.includes("@");
  const user = isEmail ? await store2.findParentByEmail(normalizedIdentifier.toLowerCase()) : await store2.findParentByPhone(normalizeParentLoginPhone(normalizedIdentifier, phoneCountryCode));
  if (!user || !isEmail && user.role !== "parent") return null;
  return await store2.verifyParentPasswordByUserId(user.id, password) ? user : null;
};

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
  async mapParentCredentialRow(row) {
    const schoolRows = await dbQuery(`
      SELECT s.id, s.name
      FROM user_schools us
      JOIN schools s ON s.id = us.school_id
      WHERE us.user_id = $1 AND us.is_active = true
    `, [row.user_id]);
    return {
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
    return this.mapParentCredentialRow(rows[0]);
  }
  async findParentByEmail(email) {
    return this.getParentByEmail(email);
  }
  async findParentByPhone(phoneCandidates) {
    if (phoneCandidates.length === 0) return null;
    const { rows } = await dbQuery(`
      SELECT u.id AS user_id, u.email, u.name, u.role, p.phone, u.school_id, la.password_hash, la.salt, la.must_reset
      FROM users u
      JOIN parents p ON p.user_id = u.id
      LEFT JOIN local_auths la ON la.user_id = u.id
      WHERE u.role = 'parent'
        AND (
          regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') = ANY($1::text[])
          OR regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g') = ANY($1::text[])
        )
    `, [phoneCandidates]);
    const match = selectUniqueParentPhoneMatch(rows);
    return match ? this.mapParentCredentialRow(match) : null;
  }
  async verifyParentPassword(email, password) {
    const user = await this.getParentByEmail(email);
    if (!user || !user.passwordHash || !user.salt) {
      return false;
    }
    const verifyHash = crypto.pbkdf2Sync(password, user.salt, 31e4, 64, "sha512").toString("hex");
    return verifyHash === user.passwordHash;
  }
  async verifyParentPasswordByUserId(userId, password) {
    const { rows } = await dbQuery(`
      SELECT la.password_hash, la.salt
      FROM users u
      LEFT JOIN local_auths la ON la.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `, [Number(userId)]);
    const auth = rows[0];
    if (!auth?.password_hash || !auth.salt) return false;
    const verifyHash = crypto.pbkdf2Sync(password, auth.salt, 31e4, 64, "sha512").toString("hex");
    return verifyHash === auth.password_hash;
  }
  async getParentById(id) {
    return this.ensureParentRecord(id);
  }
  async getChildrenOfParent(parentId) {
    const userId = Number(parentId);
    if (!Number.isInteger(userId)) return [];
    const { rows } = await dbQuery(`
      SELECT s.id, s.first_name, s.last_name, s.birth_date, s.parent_id,
             (s.photo_data IS NOT NULL) AS photo_available,
            c.name AS class_name,
            cy.code AS cycle_code
      FROM students s
      LEFT JOIN classes c ON c.id = s.class_id
          LEFT JOIN levels l ON l.id = c.level_id
          LEFT JOIN cycles cy ON cy.id = l.cycle_id
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
      className: row.class_name ?? "",
      cycleCode: row.cycle_code,
      photoAvailable: row.photo_available
    }));
  }
  async getChildPhoto(childId) {
    const childIdNum = Number(childId);
    if (!Number.isInteger(childIdNum) || childIdNum <= 0) return null;
    const { rows } = await dbQuery(`
      SELECT photo_data, photo_mime_type
      FROM students
      WHERE id = $1
    `, [childIdNum]);
    const row = rows[0];
    if (!row?.photo_data || !row.photo_mime_type) return null;
    return { photoData: row.photo_data, mimeType: row.photo_mime_type };
  }
  async saveChildPhoto(childId, photoData, mimeType) {
    const childIdNum = Number(childId);
    await dbQuery(`
      UPDATE students
      SET photo_data = $1, photo_mime_type = $2, photo_updated_at = now()
      WHERE id = $3
    `, [photoData, mimeType, childIdNum]);
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
    SELECT 
      a.id,
      a.declaration_id,
      a.date,
      a.period,
      a.is_justified,
      a.justification_reason,
      a.justification_status,
      a.rejection_reason,
      s.name AS subject_name,
      a.start_time,
      a.end_time
    FROM absences a
    LEFT JOIN subjects s ON s.id = a.subject_id
    WHERE a.student_id = $1
  `, [childIdNum]);
    return rows.map((row) => mapParentAbsenceRow(row, childId));
  }
  async justifyAbsence(absenceId, parentId, justificationReason) {
    return submitAbsenceJustificationForReview(dbQuery, absenceId, parentId, justificationReason);
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
      SELECT g.id, g.evaluation_id, e.term_id, e.subject, g.score, e.coefficient, e.title, e.date, e.max_score, g.created_at
      FROM grades g
      JOIN evaluations e ON e.id = g.evaluation_id
      WHERE g.student_id = $1
    `, [childIdNum]);
    const evaluationIds = Array.from(new Set(rows.map((row) => row.evaluation_id)));
    const scoreRows = evaluationIds.length === 0 ? [] : (await dbQuery(`
          SELECT g.evaluation_id, g.score, e.max_score
          FROM grades g
          JOIN evaluations e ON e.id = g.evaluation_id
          WHERE g.evaluation_id = ANY($1::int[])
        `, [evaluationIds])).rows;
    const scoreBounds = /* @__PURE__ */ new Map();
    for (const scoreRow of scoreRows) {
      const rawScore = Number(String(scoreRow.score ?? "").trim().replace(",", "."));
      const maxScore = Number(scoreRow.max_score);
      if (!Number.isFinite(rawScore) || !Number.isFinite(maxScore) || maxScore <= 0) continue;
      const normalizedScore = rawScore / maxScore * 20;
      const current = scoreBounds.get(scoreRow.evaluation_id) ?? { minimum: null, maximum: null };
      current.minimum = current.minimum == null ? normalizedScore : Math.min(current.minimum, normalizedScore);
      current.maximum = current.maximum == null ? normalizedScore : Math.max(current.maximum, normalizedScore);
      scoreBounds.set(scoreRow.evaluation_id, current);
    }
    return rows.map((row) => {
      const rawScore = Number(row.score);
      const maxScore = row.max_score || 20;
      const normalizedScore = rawScore / maxScore * 20;
      return {
        id: String(row.id),
        childId,
        evaluationId: String(row.evaluation_id),
        termId: row.term_id != null ? String(row.term_id) : null,
        subject: row.subject,
        // `grade` is the normalized score on a /20 scale (backward compatible)
        grade: normalizedScore,
        // Keep original max score to allow clients to display raw values
        maxScore,
        evaluationMinimumScore: scoreBounds.get(row.evaluation_id)?.minimum ?? null,
        evaluationMaximumScore: scoreBounds.get(row.evaluation_id)?.maximum ?? null,
        // Expose the raw recorded score so clients can detect double-normalization
        rawScore,
        coefficient: Number(row.coefficient ?? 1),
        examName: row.title,
        date: row.date,
        publishedAt: row.created_at ?? void 0
      };
    });
  }
  async getInAppNotifications(parentId) {
    const userId = Number(parentId);
    if (!Number.isInteger(userId)) return [];
    const { rows } = await dbQuery(`
      SELECT id, title, body, type, is_read, created_at
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);
    const notificationIds = rows.map((row) => row.id);
    const attachmentsByNotification = /* @__PURE__ */ new Map();
    if (notificationIds.length > 0) {
      const attachmentRows = await dbQuery(`
        SELECT id, notification_id AS "notificationId", file_name AS "fileName",
               mime_type AS "mimeType", file_size AS "fileSize", file_path AS "filePath"
        FROM notification_attachments
        WHERE notification_id = ANY($1::int[])
        ORDER BY id ASC
      `, [notificationIds]);
      for (const attachment of attachmentRows.rows) {
        const notificationId = Number(attachment.notificationId);
        const existing = attachmentsByNotification.get(notificationId) ?? [];
        existing.push(attachment);
        attachmentsByNotification.set(notificationId, existing);
      }
    }
    return rows.map((row) => ({
      id: String(row.id),
      parentId,
      title: row.title,
      message: row.body,
      type: row.type,
      read: row.is_read,
      createdAt: row.created_at,
      deepLink: void 0,
      attachments: (attachmentsByNotification.get(row.id) ?? []).map(({ filePath: _filePath, ...attachment }) => attachment)
    }));
  }
  async getInAppNotificationAttachment(parentId, notificationId, attachmentId) {
    const userId = Number(parentId);
    if (!Number.isInteger(userId)) return null;
    const { rows } = await dbQuery(`
      SELECT a.id, a.notification_id AS "notificationId", a.file_name AS "fileName",
             a.mime_type AS "mimeType", a.file_size AS "fileSize", a.file_path AS "filePath",
             n.user_id AS "notificationOwnerId"
      FROM notification_attachments a
      INNER JOIN notifications n ON n.id = a.notification_id
      WHERE n.id = $1
        AND a.id = $2
        AND a.notification_id = $1
      LIMIT 1
    `, [notificationId, attachmentId]);
    if (!rows[0]) return null;
    const { notificationOwnerId, ...attachment } = rows[0];
    return { attachment, authorized: Number(notificationOwnerId) === userId };
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
    console.log("DEVICES FOUND :", rows.map((row) => ({
      id: row.id,
      platform: row.platform,
      tokenPresent: Boolean(row.push_token),
      appVersion: row.app_version
    })));
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

// backend/mobilePhotoRoutes.ts
var import_multer = __toESM(require("multer"), 1);
var allowedPhotoMimeTypes = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp"]);
var photoUpload = (0, import_multer.default)({
  storage: import_multer.default.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowedPhotoMimeTypes.has(file.mimetype)) {
      return callback(new Error("Seules les images JPEG, PNG et WebP sont accept\xE9es."));
    }
    callback(null, true);
  }
}).single("file");
function registerChildPhotoRoutes(app2, requireAuth2, requireParentRoleOnly2, store2) {
  const requireChildOwnership = (req, res, next) => {
    const parentId = req.parent?.id;
    if (!parentId) {
      return res.status(401).json({ error: "Authentification requise.", code: "UNAUTHORIZED" });
    }
    void store2.isChildOwnedByParent(req.params.childId, parentId).then((isOwned) => {
      if (!isOwned) {
        return res.status(403).json({
          error: "Acc\xE8s refus\xE9. Cet enfant ne vous est pas rattach\xE9.",
          code: "CHILD_OWNERSHIP_VIOLATION"
        });
      }
      next();
    }).catch(next);
  };
  const parsePhotoUpload = (req, res, next) => {
    photoUpload(req, res, (error) => {
      if (!error) return next();
      return res.status(400).json({
        error: error.message || "Fichier photo invalide.",
        code: "CHILD_PHOTO_UPLOAD_INVALID"
      });
    });
  };
  app2.post(
    "/api/mobile/parent/children/:childId/photo",
    requireAuth2,
    requireParentRoleOnly2,
    requireChildOwnership,
    parsePhotoUpload,
    (req, res, next) => {
      const file = req.file;
      if (!file || file.size === 0) {
        return res.status(400).json({
          error: "Veuillez fournir une image non vide.",
          code: "CHILD_PHOTO_REQUIRED"
        });
      }
      void store2.saveChildPhoto(req.params.childId, file.buffer, file.mimetype).then(() => res.status(200).json({ success: true })).catch(next);
    }
  );
  app2.get(
    "/api/mobile/parent/children/:childId/photo",
    requireAuth2,
    requireParentRoleOnly2,
    requireChildOwnership,
    (req, res, next) => {
      void store2.getChildPhoto(req.params.childId).then((photo) => {
        if (!photo) {
          return res.status(404).json({
            error: "Photo de l\u2019enfant introuvable.",
            code: "CHILD_PHOTO_NOT_FOUND"
          });
        }
        if (!allowedPhotoMimeTypes.has(photo.mimeType)) {
          return res.status(500).json({
            error: "Le type de la photo enregistr\xE9e est invalide.",
            code: "CHILD_PHOTO_INVALID_MIME_TYPE"
          });
        }
        res.setHeader("Content-Type", photo.mimeType);
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).send(photo.photoData);
      }).catch(next);
    }
  );
}

// backend/parentWhatsAppRoute.ts
var parseStudentId = (value) => {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const studentId = Number(value);
  return Number.isSafeInteger(studentId) ? studentId : null;
};
var normalizeWhatsAppNumber = (value) => {
  if (typeof value !== "string") return null;
  const trimmedValue = value.trim();
  if (!/^(?:\+|00)?[\d\s()./-]+$/.test(trimmedValue)) return null;
  const number = normalizeParentLoginPhone(trimmedValue)[0];
  return number && /^[1-9]\d{1,14}$/.test(number) ? number : null;
};
function registerParentWhatsAppRoute(app2, requireAuth2, requireParentRoleOnly2, store2, database) {
  app2.get(
    "/api/mobile/parent/whatsapp-contact",
    requireAuth2,
    requireParentRoleOnly2,
    async (req, res) => {
      const parentId = req.parent?.id;
      const studentId = parseStudentId(req.query.studentId);
      if (!parentId) {
        return res.status(401).json({ error: "Authentification requise.", code: "UNAUTHORIZED" });
      }
      if (studentId === null) {
        return res.status(400).json({ error: "Identifiant d\u2019enfant invalide.", code: "INVALID_STUDENT_ID" });
      }
      try {
        if (!await store2.isChildOwnedByParent(String(studentId), parentId)) {
          return res.status(404).json({ error: "Enfant introuvable.", code: "CHILD_NOT_FOUND" });
        }
        const studentResult = await database.dbQuery(
          "SELECT school_id FROM students WHERE id = $1 LIMIT 1",
          [studentId]
        );
        const schoolId = studentResult.rows[0]?.school_id;
        if (schoolId == null) {
          return res.json({ whatsappUrl: null });
        }
        const administrators = await database.dbQuery(
          `SELECT phone
           FROM users
           WHERE role = 'school_admin'
             AND school_id = $1
             AND phone IS NOT NULL
           ORDER BY id ASC`,
          [schoolId]
        );
        for (const administrator of administrators.rows) {
          const number = normalizeWhatsAppNumber(administrator.phone);
          if (number) {
            const message = encodeURIComponent("Bonjour, je souhaite contacter l\u2019administration de l\u2019\xE9cole.");
            return res.json({ whatsappUrl: `https://wa.me/${number}?text=${message}` });
          }
        }
        return res.json({ whatsappUrl: null });
      } catch (error) {
        console.error("Failed to resolve mobile parent WhatsApp contact:", error);
        return res.status(500).json({ error: "Impossible de r\xE9cup\xE9rer le contact WhatsApp." });
      }
    }
  );
}

// backend/temporaryUploadCleanup.ts
var import_node_fs = require("node:fs");
var import_node_path = __toESM(require("node:path"), 1);
async function withTemporaryUploadCleanup(files, uploadDirectory, operation) {
  try {
    return await operation();
  } finally {
    const root = import_node_path.default.resolve(uploadDirectory);
    await Promise.all(files.map(async (file) => {
      if (!file?.path) return;
      const filePath = import_node_path.default.resolve(file.path);
      if (import_node_path.default.dirname(filePath) !== root) return;
      try {
        await import_node_fs.promises.unlink(filePath);
      } catch (error) {
        if (error?.code !== "ENOENT") {
          console.error("Failed to remove a temporary absence justification file:", error?.code || "UNKNOWN");
        }
      }
    }));
  }
}

// backend/absenceDeclarations.ts
var import_node_crypto = __toESM(require("node:crypto"), 1);
var AbsenceDeclarationRelayError = class extends Error {
  constructor(message, status) {
    super(message);
    this.name = "AbsenceDeclarationRelayError";
    this.status = status;
  }
};
async function relayAbsenceDeclaration(webBackendUrl2, internalSecret, parentUserId, action, input = {}, fetcher = fetch) {
  const baseUrl = webBackendUrl2.trim().replace(/\/+$/, "");
  if (!baseUrl || !internalSecret.trim()) {
    throw new AbsenceDeclarationRelayError("Le serveur Web des d\xE9clarations est indisponible.", 502);
  }
  const payload = { parentUserId, action, input };
  const timestamp = Date.now().toString();
  const hmac = import_node_crypto.default.createHmac("sha256", internalSecret);
  hmac.update(`${JSON.stringify(payload)}${timestamp}`);
  const signature = hmac.digest("hex");
  let response;
  try {
    response = await fetcher(`${baseUrl}/api/internal/absence-declarations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Timestamp": timestamp,
        "X-Internal-Signature": signature
      },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new AbsenceDeclarationRelayError("Le serveur Web des d\xE9clarations est indisponible.", 502);
  }
  const body = await response.json().catch(() => ({ error: "R\xE9ponse invalide du serveur Web." }));
  if (!response.ok) {
    throw new AbsenceDeclarationRelayError(body?.error || "La d\xE9claration n\u2019a pas pu \xEAtre transmise.", response.status);
  }
  return { status: response.status, body };
}

// src/utils/schoolPeriod.ts
function getExpectedPeriodTypeForCycle(cycleCode) {
  if (cycleCode === "college") return "trimester";
  if (cycleCode === "lycee") return "semester";
  return null;
}

// src/utils/termAverage.ts
function calculateCurrentTermAverage(gradeRows, activeTerm) {
  const usedEvaluations = [];
  const ignoredEvaluations = [];
  if (!activeTerm) {
    return { termAverage: null, termEvaluationCount: 0, usedEvaluations, ignoredEvaluations };
  }
  const gradesByEvaluation = /* @__PURE__ */ new Map();
  for (const row of gradeRows) {
    const existing = gradesByEvaluation.get(row.evaluationId) ?? [];
    existing.push(row);
    gradesByEvaluation.set(row.evaluationId, existing);
  }
  let totalWeighted = 0;
  let totalCoefficient = 0;
  let termEvaluationCount = 0;
  for (const rows of gradesByEvaluation.values()) {
    const evaluation = rows[0];
    const evaluationDate = String(evaluation.date).slice(0, 10);
    const termMatches = evaluationDate >= activeTerm.startDate && evaluationDate <= activeTerm.endDate;
    if (!termMatches) {
      ignoredEvaluations.push(`${evaluation.subject} ${evaluation.score}/${evaluation.maxScore ?? 20} -> term_id=${evaluation.termId}`);
      continue;
    }
    termEvaluationCount += 1;
    const latestGrade = [...rows].sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    })[0];
    const rawScore = latestGrade.score.trim().replace(",", ".");
    const rawValue = Number(rawScore);
    if (!Number.isFinite(rawValue)) {
      ignoredEvaluations.push(`${evaluation.subject} ${latestGrade.score} -> invalid raw score`);
      continue;
    }
    const maxScore = Number(evaluation.maxScore ?? 20);
    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      ignoredEvaluations.push(`${evaluation.subject} ${rawValue}/${evaluation.maxScore} -> invalid maxScore`);
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
  return {
    termAverage: totalCoefficient > 0 ? Number((totalWeighted / totalCoefficient).toFixed(2)) : null,
    termEvaluationCount,
    usedEvaluations,
    ignoredEvaluations
  };
}

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
var JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || !JWT_SECRET.trim()) {
  throw new Error("JWT_SECRET environment variable is required");
}
var ACCESS_TOKEN_EXPIRY_MS = 15 * 60 * 1e3;
var REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1e3;
function hashRefreshToken(refreshToken) {
  return import_crypto.default.createHash("sha256").update(refreshToken).digest("hex");
}
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
  static async createSession(parentId, role) {
    const accessToken = this.generateJWT({ parentId, role }, JWT_SECRET, ACCESS_TOKEN_EXPIRY_MS);
    const entropy = import_crypto.default.randomBytes(16).toString("hex");
    const refreshToken = this.generateJWT({ parentId, role, entropy }, JWT_SECRET, REFRESH_TOKEN_EXPIRY_MS);
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS).toISOString();
    await dbQuery(`
      INSERT INTO mobile_parent_sessions (parent_id, role, refresh_token_hash, expires_at, is_active)
      VALUES ($1, $2, $3, $4, true)
    `, [parentId, role, refreshTokenHash, expiresAt]);
    logger3.info(`Session created for parent: ${parentId}`);
    return { accessToken, refreshToken };
  }
  /**
   * Rotates a Refresh Token (Refresh Token Rotation - RTR)
   * Prevents replay attacks by invalidating the old Refresh Token and issuing a new pair.
   */
  static async ensureSessionRecordForToken(parentId, role, refreshToken, expiresAt) {
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const { rows } = await dbQuery(`
      SELECT id, parent_id, role, refresh_token_hash, is_active, expires_at
      FROM mobile_parent_sessions
      WHERE refresh_token_hash = $1
      LIMIT 1
    `, [refreshTokenHash]);
    if (rows.length > 0) {
      return rows[0];
    }
    await dbQuery(`
      INSERT INTO mobile_parent_sessions (parent_id, role, refresh_token_hash, expires_at, is_active)
      VALUES ($1, $2, $3, $4, true)
    `, [parentId, role, refreshTokenHash, expiresAt]);
    const result = await dbQuery(`
      SELECT id, parent_id, role, refresh_token_hash, is_active, expires_at
      FROM mobile_parent_sessions
      WHERE refresh_token_hash = $1
      LIMIT 1
    `, [refreshTokenHash]);
    return result.rows[0];
  }
  static async rotateSession(oldRefreshToken) {
    const payload = this.verifyJWT(oldRefreshToken);
    if (!payload) {
      logger3.warn("Rotation attempted with invalid or expired Refresh Token.");
      return null;
    }
    const { parentId, role, exp } = payload;
    const refreshTokenHash = hashRefreshToken(oldRefreshToken);
    const expiresAt = new Date(exp).toISOString();
    const existingSession = await this.ensureSessionRecordForToken(parentId, role, oldRefreshToken, expiresAt);
    if (!existingSession.is_active) {
      logger3.warn(`Refresh Token not found or inactive for parent: ${parentId}`);
      return null;
    }
    if (new Date(existingSession.expires_at).getTime() < Date.now()) {
      logger3.warn(`Refresh Token expired in DB for parent: ${parentId}`);
      return null;
    }
    await dbQuery(`
      UPDATE mobile_parent_sessions
      SET is_active = false, revoked_at = now(), last_used_at = now()
      WHERE id = $1
    `, [existingSession.id]);
    const newSession = await this.createSession(parentId, role);
    return newSession;
  }
  /**
   * Revokes a specific session (Logout)
   */
  static async revokeSession(parentId, refreshToken) {
    const refreshTokenHash = hashRefreshToken(refreshToken);
    await dbQuery(`
      UPDATE mobile_parent_sessions
      SET is_active = false, revoked_at = now()
      WHERE parent_id = $1 AND refresh_token_hash = $2 AND is_active = true
    `, [parentId, refreshTokenHash]);
    logger3.info(`Session revoked for parent: ${parentId}`);
  }
  /**
   * Revokes all sessions for a user (e.g., when a compromise is detected)
   */
  static async revokeAllSessions(parentId) {
    await dbQuery(`
      UPDATE mobile_parent_sessions
      SET is_active = false, revoked_at = now()
      WHERE parent_id = $1 AND is_active = true
    `, [parentId]);
    logger3.audit("REVOKE_ALL_SESSIONS", parentId, { parentId }, "SUCCESS");
  }
  /**
   * Verifies HMAC-SHA256 signature for internal server-to-server calls
   * Requires: X-Internal-Signature and X-Internal-Timestamp headers
   * Signature format: HMAC-SHA256(body + timestamp, INTERNAL_SECRET)
   * Prevents: Unauthorized callers, request forgery, replay attacks
   */
  static verifyInternalSignature(body, signature, timestamp) {
    const INTERNAL_SECRET = process.env.INTERNAL_SECRET;
    if (!INTERNAL_SECRET || !INTERNAL_SECRET.trim()) {
      logger3.error("INTERNAL_SECRET environment variable is missing or empty");
      return false;
    }
    if (!signature || !timestamp) {
      logger3.warn("Missing internal signature or timestamp headers");
      return false;
    }
    const requestTime = parseInt(timestamp, 10);
    const currentTime = Date.now();
    const maxTimestampAge = 5 * 60 * 1e3;
    if (isNaN(requestTime) || Math.abs(currentTime - requestTime) > maxTimestampAge) {
      logger3.warn(`Timestamp replay detected or invalid: requested=${requestTime}, now=${currentTime}, diff=${Math.abs(currentTime - requestTime)}ms`);
      return false;
    }
    const messageToSign = `${body}${timestamp}`;
    const hmac = import_crypto.default.createHmac("sha256", INTERNAL_SECRET);
    hmac.update(messageToSign);
    const expectedSignature = hmac.digest("hex");
    const isValid = signature === expectedSignature;
    if (!isValid) {
      logger3.warn(`HMAC signature mismatch: expected=${expectedSignature}, received=${signature}`);
    }
    return isValid;
  }
};

// backend/services/fcm.ts
var import_app = require("firebase-admin/app");
var import_messaging = require("firebase-admin/messaging");
var fs = __toESM(require("fs"), 1);
var path3 = __toESM(require("path"), 1);
var logger4 = new Logger("FCMService");
var serviceAccount = process.env.FCM_SERVICE_ACCOUNT_JSON ? JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON) : JSON.parse(
  fs.readFileSync(
    path3.join(process.cwd(), "config", "firebase-service-account.json"),
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
async function sendPushNotification(token, title, body, target = "home", metadata = {}) {
  const attachments = Array.isArray(metadata.attachments) ? metadata.attachments.filter((attachment) => Boolean(attachment) && typeof attachment === "object") : [];
  const attachmentCount = Number(metadata.attachmentCount ?? attachments.length);
  const validAttachmentCount = Number.isInteger(attachmentCount) && attachmentCount > 0 ? attachmentCount : 0;
  const attachmentNames = attachments.map((attachment) => typeof attachment.fileName === "string" ? attachment.fileName.trim() : "").filter(Boolean);
  const attachmentSummary = validAttachmentCount === 0 ? "" : validAttachmentCount === 1 && attachmentNames[0] ? `
\u{1F4CE} 1 pi\xE8ce jointe : ${attachmentNames[0]}` : `
\u{1F4CE} ${validAttachmentCount} pi\xE8ces jointes`;
  const notificationBody = `${body}${attachmentSummary}`;
  const maskedToken = token ? `${token.slice(0, 10)}...` : "<missing>";
  logger4.info("[NOTIF_TRACE] sendPushNotification start", { token: maskedToken, title, body: notificationBody, target });
  const data = {
    title,
    body: notificationBody,
    target
  };
  if (metadata.notificationId != null) {
    data.notificationId = String(metadata.notificationId);
  }
  if (validAttachmentCount > 0) {
    data.attachmentCount = String(validAttachmentCount);
  }
  const message = {
    token,
    notification: {
      title,
      body: notificationBody
    },
    data,
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
    logger4.info("[NOTIF_TRACE] sendPushNotification payload", { token: maskedToken, title, body: notificationBody, target });
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
    logger5.info("[NOTIF_TRACE] addJob", {
      jobName: name,
      parentId,
      tokenPresent: Boolean(token),
      title: jobData?.title,
      message: jobData?.message,
      priority,
      hasDedupeKey: Boolean(dedupeKey)
    });
    if (dedupeKey && completedJobIds.has(dedupeKey)) {
      if (jobData?.category === "grade") {
        logger5.info("grade push deduplicated", {
          gradeId: jobData?.metadata?.gradeId,
          eventVersion: jobData?.metadata?.eventVersion,
          parentId,
          reason: "already-completed"
        });
      } else {
        logger5.info("Idempotency hit: completed job skipped", { jobName: name, parentId });
      }
      return `skipped-${dedupeKey}`;
    }
    if (dedupeKey && activeQueue.some((j) => j.dedupeKey === dedupeKey)) {
      if (jobData?.category === "grade") {
        logger5.info("grade push deduplicated", {
          gradeId: jobData?.metadata?.gradeId,
          eventVersion: jobData?.metadata?.eventVersion,
          parentId,
          reason: "already-queued"
        });
      } else {
        logger5.info("Duplicate active job skipped", { jobName: name, parentId });
      }
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
    logger5.info(`Job added to queue: ${name} [ID: ${job.id}]`, { jobId: job.id, priority, hasDedupeKey: Boolean(dedupeKey) });
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
    logger5.info("[NOTIF_TRACE] processNextJob start", {
      jobId: job.id,
      jobName: job.name,
      parentId: jobData?.parentId,
      tokenPresent: Boolean(jobData?.token),
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
      if (jobData?.category === "grade" && job.name.startsWith("send-notification-push")) {
        logger5.info("grade push sent", {
          gradeId: jobData?.metadata?.gradeId,
          eventVersion: jobData?.metadata?.eventVersion,
          parentId: jobData?.parentId,
          jobId: job.id
        });
      }
      logger5.info(`Job completed successfully: ${job.name} [ID: ${job.id}]`);
    } catch (err) {
      const errorMessage = err?.name || "Unknown error";
      job.errorHistory.push({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        message: errorMessage
      });
      if (err instanceof InvalidFcmTokenError) {
        const invalidToken = err.token;
        const parentId = job.data?.parentId;
        logger5.warn(`Invalid FCM token detected, removing it and not retrying job: ${job.name} [ID: ${job.id}]`, {
          jobId: job.id,
          parentId,
          errorCode: err.originalError instanceof Error ? err.originalError.name : "FCM_ERROR"
        });
        if (job.data?.category === "grade") {
          logger5.error("grade push failed", void 0, {
            gradeId: job.data?.metadata?.gradeId,
            eventVersion: job.data?.metadata?.eventVersion,
            parentId,
            jobId: job.id,
            errorName: "InvalidFcmTokenError"
          });
        }
        if (parentId) {
          try {
            await store.deletePushToken(parentId, invalidToken);
            logger5.info(`Invalid FCM token removed from database`, { parentId });
          } catch (deleteError) {
            logger5.error(`Failed to delete invalid FCM token from database`, void 0, {
              parentId,
              errorName: deleteError instanceof Error ? deleteError.name : "Unknown error"
            });
          }
        }
        if (job.dedupeKey) {
          completedJobIds.add(job.dedupeKey);
        }
        return;
      }
      const jobData2 = job.data;
      logger5.error(`Job execution failed: ${job.name} [ID: ${job.id}]`, void 0, {
        errorName: err?.name || "Unknown error",
        jobId: job.id,
        jobName: job.name,
        parentId: jobData2?.parentId,
        title: jobData2?.title,
        message: jobData2?.message,
        attempts: job.attempts,
        errorHistory: job.errorHistory
      });
      if (jobData2?.category === "grade" && job.name.startsWith("send-notification-push")) {
        logger5.error("grade push failed", void 0, {
          gradeId: jobData2?.metadata?.gradeId,
          eventVersion: jobData2?.metadata?.eventVersion,
          parentId: jobData2?.parentId,
          jobId: job.id,
          errorName: err?.name || "Unknown error",
          attempt: job.attempts
        });
      }
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
    logger5.info("[NOTIF_TRACE] executeJobLogic started", {
      jobName: job.name,
      jobId: job.id,
      parentId: jobData?.parentId,
      tokenPresent: Boolean(jobData?.token),
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
          target = "home",
          metadata = {}
        } = job.data;
        if (!token) {
          throw new Error("FCM token missing");
        }
        logger5.info("[NOTIF_TRACE] About to call sendPushNotification", { parentId: jobData?.parentId, jobId: job.id, title, message, target });
        await sendPushNotification(
          token,
          title,
          message,
          target,
          metadata
        );
        logger5.info("[NOTIF_TRACE] FCM envoy\xE9 avec succ\xE8s", { title, target, jobId: job.id });
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
      logger5.error("[NOTIF_TRACE] executeJobLogic error", void 0, {
        errorName: err?.name || "Unknown error",
        jobId: job.id,
        jobName: job.name,
        parentId: jobData?.parentId,
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
var import_node_crypto2 = require("node:crypto");
var logger6 = new Logger("NotificationService");
var NotificationService = class {
  /**
   * Orchestrates multi-channel delivery based on parent consents and quiet hours
   */
  static async dispatchNotification(parentId, title, message, category, metadata = {}, dedupeKey) {
    logger6.info("[NOTIF_TRACE] dispatchNotification start", { parentId, category, title, hasDedupeKey: Boolean(dedupeKey), metadata });
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
      logger6.info("Devices found", { parentId: effectiveParentId, deviceCount: devices.length });
      logger6.info("[TRACE] Push tokens resolved", { parentId: effectiveParentId, pushTokenCount: pushTokens.length });
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
            const tokenHash = (0, import_node_crypto2.createHash)("sha256").update(token).digest("hex");
            const jobDedupeKey = dedupeKey ? `${dedupeKey}-${channel}-${tokenHash}` : void 0;
            logger6.info("[NOTIF_TRACE] QueueManager.addJob preparing", { channel, tokenPresent: Boolean(token), jobName, hasDedupeKey: Boolean(jobDedupeKey) });
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
            const isGradeNotification = category === "grade";
            const eventDetails = isGradeNotification ? { gradeId: metadata?.gradeId, eventVersion: metadata?.eventVersion } : {};
            if (jobId.startsWith("skipped-") || jobId.startsWith("queued-")) {
              if (isGradeNotification) {
                logger6.info("grade push deduplicated", { ...eventDetails, parentId: effectiveParentId, jobName });
              }
            } else if (isGradeNotification) {
              logger6.info("grade push queued", { ...eventDetails, parentId: effectiveParentId, jobId });
            }
            logger6.info("[NOTIF_TRACE] QueueManager.addJob completed", { jobName, jobId, parentId: effectiveParentId, channel, hasDedupeKey: Boolean(jobDedupeKey), tokenPresent: Boolean(token) });
            jobsTriggered.push(jobId);
          }
        } else {
          const jobDedupeKey = dedupeKey ? `${dedupeKey}-${channel}` : void 0;
          logger6.info("[NOTIF_TRACE] QueueManager.addJob preparing", { channel, tokenPresent: false, jobName, hasDedupeKey: Boolean(jobDedupeKey) });
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
          logger6.info("[NOTIF_TRACE] QueueManager.addJob queued", { jobName, jobId, parentId: effectiveParentId, channel, hasDedupeKey: Boolean(jobDedupeKey), tokenPresent: false });
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
  identifier: import_zod.z.string().trim().min(1).optional(),
  email: import_zod.z.string().email({ message: "Format d'email invalide." }).optional(),
  phoneCountryCode: import_zod.z.string().trim().optional(),
  password: import_zod.z.string().min(4, { message: "Le mot de passe doit contenir au moins 4 caract\xE8res." })
}).refine((value) => Boolean(value.identifier || value.email), {
  message: "Un email ou un num\xE9ro de t\xE9l\xE9phone est requis.",
  path: ["identifier"]
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
var ParentAbsenceDeclarationSchema = import_zod.z.object({
  childId: import_zod.z.string().regex(/^\d+$/, { message: "Identifiant d\u2019enfant invalide." }),
  date: import_zod.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Format de date invalide (AAAA-MM-JJ)." }),
  startTime: import_zod.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Format d\u2019heure invalide (HH:MM)." }),
  endTime: import_zod.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Format d\u2019heure invalide (HH:MM)." }),
  reason: import_zod.z.string({ error: "Le motif de d\xE9claration est obligatoire." }).max(1e3, { message: "Le motif ne peut pas d\xE9passer 1000 caract\xE8res." }).trim().min(1, { message: "Le motif de d\xE9claration est obligatoire." })
}).refine((value) => {
  const parsed = /* @__PURE__ */ new Date(`${value.date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value.date;
}, {
  message: "Date invalide.",
  path: ["date"]
}).refine((value) => value.startTime < value.endTime, {
  message: "L\u2019heure de fin doit \xEAtre post\xE9rieure \xE0 l\u2019heure de d\xE9but.",
  path: ["endTime"]
});
var DevAddGradeSchema = import_zod.z.object({
  childId: import_zod.z.string().min(1),
  subject: import_zod.z.string().min(1),
  grade: import_zod.z.number().min(0).max(20),
  coefficient: import_zod.z.number().positive().optional(),
  examName: import_zod.z.string().min(1),
  date: import_zod.z.string().optional()
});

// src/utils/passwordPolicy.ts
var TEMPORARY_PASSWORD = "123456";
function getNewPasswordPolicyError(password) {
  if (password === TEMPORARY_PASSWORD) {
    return "Le nouveau mot de passe ne peut pas \xEAtre le mot de passe temporaire.";
  }
  const missingRules = [];
  if ([...password].length < 8) missingRules.push("au moins 8 caract\xE8res");
  if (!/[A-Z]/.test(password)) missingRules.push("au moins une lettre majuscule");
  if (!/[0-9]/.test(password)) missingRules.push("au moins un chiffre");
  if (missingRules.length === 0) return null;
  const requirements = missingRules.length === 1 ? missingRules[0] : `${missingRules.slice(0, -1).join(", ")} et ${missingRules[missingRules.length - 1]}`;
  return `Le nouveau mot de passe doit contenir ${requirements}.`;
}

// server.ts
var logger7 = new Logger("ExpressServer");
var app = (0, import_express.default)();
var PORT = Number(process.env.PORT) || 3001;
var uploadStorageDir = import_path2.default.join(process.cwd(), "uploads", "absence-justifications");
var webBackendUrl = () => (process.env.WEB_BACKEND_URL || "").trim().replace(/\/+$/, "");
var MAX_ABSENCE_ATTACHMENT_COUNT = 5;
var allowedJustificationMimeTypes = ["application/pdf", "image/png", "image/jpeg"];
var upload = (0, import_multer2.default)({
  storage: import_multer2.default.diskStorage({
    destination: uploadStorageDir,
    filename: (_req, file, cb) => {
      const randomSuffix = import_crypto2.default.randomBytes(16).toString("hex");
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}-${randomSuffix}-${safeName}`);
    }
  }),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: MAX_ABSENCE_ATTACHMENT_COUNT
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedJustificationMimeTypes.includes(file.mimetype)) {
      return cb(new Error("Unsupported file type"));
    }
    cb(null, true);
  }
});
var handleAbsenceJustificationUpload = (req, res, next) => {
  upload.fields([
    { name: "files", maxCount: MAX_ABSENCE_ATTACHMENT_COUNT },
    { name: "file", maxCount: 1 }
  ])(req, res, async (err) => {
    if (err) {
      const partialFiles = collectAbsenceJustificationFiles(req);
      await withTemporaryUploadCleanup(partialFiles, uploadStorageDir, async () => void 0);
      return res.status(400).json({ error: err.message || "Invalid file upload", code: "UPLOAD_INVALID" });
    }
    req.uploadedFiles = collectAbsenceJustificationFiles(req);
    return next();
  });
};
function collectAbsenceJustificationFiles(req) {
  const files = [];
  const requestFiles = req.files;
  if (Array.isArray(requestFiles)) {
    files.push(...requestFiles);
  } else if (requestFiles && typeof requestFiles === "object") {
    for (const fieldFiles of Object.values(requestFiles)) {
      files.push(...fieldFiles);
    }
  }
  if (req.file) files.push(req.file);
  return Array.from(new Map(files.filter((file) => file?.path).map((file) => [file.path, file])).values());
}
async function forwardAbsenceJustificationToWeb(absenceId, parentId, justificationReason, uploadedFile) {
  const targetBaseUrl = webBackendUrl();
  if (!targetBaseUrl) {
    throw new Error("WEB_BACKEND_URL is not configured");
  }
  const fileBuffer = await import_fs2.promises.readFile(uploadedFile.path);
  const fileSha256 = import_crypto2.default.createHash("sha256").update(fileBuffer).digest("hex");
  const payload = {
    absenceId: String(absenceId),
    parentId: String(parentId),
    justificationReason,
    fileName: uploadedFile.originalname,
    fileMimeType: uploadedFile.mimetype,
    fileSize: String(uploadedFile.size),
    fileSha256
  };
  const timestamp = Date.now().toString();
  const internalSecret = process.env.INTERNAL_SECRET;
  if (!internalSecret || !internalSecret.trim()) {
    throw new Error("INTERNAL_SECRET is not configured");
  }
  const hmac = import_crypto2.default.createHmac("sha256", internalSecret);
  hmac.update(`${JSON.stringify(payload)}${timestamp}`);
  const signature = hmac.digest("hex");
  const formData = new FormData();
  formData.append("absenceId", payload.absenceId);
  formData.append("parentId", payload.parentId);
  formData.append("justificationReason", payload.justificationReason);
  formData.append("fileName", payload.fileName);
  formData.append("fileMimeType", payload.fileMimeType);
  formData.append("fileSize", payload.fileSize);
  formData.append("fileSha256", payload.fileSha256);
  formData.append("file", new Blob([fileBuffer], { type: uploadedFile.mimetype }), uploadedFile.originalname);
  const response = await fetch(`${targetBaseUrl}/api/internal/absence-justification`, {
    method: "POST",
    headers: {
      "X-Internal-Signature": signature,
      "X-Internal-Timestamp": timestamp
    },
    body: formData
  });
  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    try {
      const errorPayload = JSON.parse(responseBody);
      if (response.status === 409 && errorPayload?.code === "JUSTIFICATION_ALREADY_REJECTED") {
        throw new AbsenceJustificationAlreadyRejectedError();
      }
    } catch (error) {
      if (error instanceof AbsenceJustificationAlreadyRejectedError) throw error;
    }
    throw new Error(`Web justification upload failed with status ${response.status}`);
  }
}
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
var verifyInternalAuth = (req, res, next) => {
  const signature = req.headers["x-internal-signature"];
  const timestamp = req.headers["x-internal-timestamp"];
  let body = "";
  if (typeof req.body === "object") {
    body = JSON.stringify(req.body);
  } else {
    body = String(req.body || "");
  }
  if (!AuthService.verifyInternalSignature(body, signature, timestamp)) {
    logger7.warn(`[SECURITY VIOLATION] Invalid internal signature or timestamp. IP: ${req.ip}, URL: ${req.originalUrl}`);
    return res.status(401).json({
      error: "Signature interne invalide ou expir\xE9e.",
      code: "INVALID_INTERNAL_SIGNATURE"
    });
  }
  logger7.info(`[INTERNAL_AUTH] Valid signature verified for ${req.method} ${req.originalUrl}`);
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
  const { email, identifier, phoneCountryCode, password } = validation.data;
  const loginIdentifier = String(identifier ?? email ?? "").trim();
  const user = await authenticateMobileParentLogin(loginIdentifier, password, phoneCountryCode, store);
  if (!user) {
    logger7.warn("\xC9chec de connexion parent: identifiant ou mot de passe invalide.");
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
  const session = await AuthService.createSession(user.id, user.role);
  try {
    await dbQuery(`
      INSERT INTO user_login_events (user_id, role, school_id, client_type)
      VALUES ($1, $2, $3, $4)
    `, [Number(user.id), user.role, user.activeSchoolId ? Number(user.activeSchoolId) : null, "android"]);
  } catch {
    logger7.warn("Impossible d'enregistrer l'\xE9v\xE9nement de connexion Android; le login continue.");
  }
  const parentDetails = {
    id: user.id,
    name: user.name,
    email: user.email,
    activeSchoolId: user.activeSchoolId,
    schools: user.schools
  };
  logger7.audit("PARENT_LOGIN_SUCCESS", user.id, { mustReset: localMustReset }, "SUCCESS");
  return res.json({
    parent: parentDetails,
    token: session.accessToken,
    refreshToken: session.refreshToken,
    mustReset: localMustReset
  });
});
app.post("/api/mobile/parent/change-password", rateLimit(15, 6e4), async (req, res) => {
  const { email, identifier, phoneCountryCode, currentPassword, newPassword } = req.body ?? {};
  const loginIdentifier = String(identifier ?? email ?? "").trim();
  if (!loginIdentifier || !currentPassword || !newPassword) {
    return res.status(400).json({
      error: "Identifiant, mot de passe actuel et nouveau mot de passe sont requis.",
      code: "BAD_REQUEST"
    });
  }
  const passwordPolicyError = getNewPasswordPolicyError(String(newPassword));
  if (passwordPolicyError) {
    return res.status(400).json({
      error: passwordPolicyError,
      code: "INVALID_PASSWORD"
    });
  }
  const user = await authenticateMobileParentLogin(loginIdentifier, String(currentPassword), phoneCountryCode, store);
  if (!user) {
    return res.status(401).json({
      error: "Identifiants de connexion incorrects.",
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
  logger7.audit("PARENT_CHANGE_PASSWORD", user.id, {}, "SUCCESS");
  return res.json({ success: true });
});
app.post("/api/mobile/parent/refresh-token", rateLimit(15, 6e4), async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({
      error: "Refresh token manquant.",
      code: "BAD_REQUEST"
    });
  }
  const newSession = await AuthService.rotateSession(refreshToken);
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
    await AuthService.revokeSession(parentId, refreshToken);
  } else {
    await AuthService.revokeAllSessions(parentId);
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
registerChildPhotoRoutes(app, requireAuth, requireParentRoleOnly, store);
registerParentWhatsAppRoute(app, requireAuth, requireParentRoleOnly, store, { dbQuery });
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
var toMobileAbsenceDeclaration = (row) => row && {
  id: String(row.id),
  childId: String(row.studentId),
  date: row.date,
  startTime: row.startTime,
  endTime: row.endTime,
  reason: row.reason ?? void 0,
  status: row.status,
  rejectionReason: row.rejectionReason ?? void 0
};
app.get("/api/mobile/parent/absence-declarations", requireAuth, requireParentRoleOnly, async (req, res) => {
  try {
    const result = await relayAbsenceDeclaration(
      webBackendUrl(),
      process.env.INTERNAL_SECRET || "",
      req.parent.id,
      "list"
    );
    return res.json(Array.isArray(result.body) ? result.body.map(toMobileAbsenceDeclaration) : []);
  } catch (error) {
    const status = error instanceof AbsenceDeclarationRelayError ? error.status : 502;
    return res.status(status).json({ error: error?.message || "Impossible de charger les d\xE9clarations." });
  }
});
app.post("/api/mobile/parent/absence-declarations", requireAuth, requireParentRoleOnly, async (req, res) => {
  const validation = ParentAbsenceDeclarationSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: "Donn\xE9es de d\xE9claration invalides.", details: validation.error.issues });
  try {
    const input = validation.data;
    const result = await relayAbsenceDeclaration(
      webBackendUrl(),
      process.env.INTERNAL_SECRET || "",
      req.parent.id,
      "create",
      { studentId: Number(input.childId), date: input.date, startTime: input.startTime, endTime: input.endTime, reason: input.reason }
    );
    return res.status(result.status).json(toMobileAbsenceDeclaration(result.body));
  } catch (error) {
    const status = error instanceof AbsenceDeclarationRelayError ? error.status : 502;
    return res.status(status).json({ error: error?.message || "Impossible de transmettre la d\xE9claration." });
  }
});
app.put("/api/mobile/parent/absence-declarations/:id", requireAuth, requireParentRoleOnly, async (req, res) => {
  const validation = ParentAbsenceDeclarationSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: "Donn\xE9es de d\xE9claration invalides.", details: validation.error.issues });
  try {
    const input = validation.data;
    const result = await relayAbsenceDeclaration(
      webBackendUrl(),
      process.env.INTERNAL_SECRET || "",
      req.parent.id,
      "update",
      { id: req.params.id, studentId: Number(input.childId), date: input.date, startTime: input.startTime, endTime: input.endTime, reason: input.reason }
    );
    return res.json(toMobileAbsenceDeclaration(result.body));
  } catch (error) {
    const status = error instanceof AbsenceDeclarationRelayError ? error.status : 502;
    return res.status(status).json({ error: error?.message || "Impossible de modifier la d\xE9claration." });
  }
});
app.put("/api/mobile/parent/absence-declarations/:id/cancel", requireAuth, requireParentRoleOnly, async (req, res) => {
  try {
    const result = await relayAbsenceDeclaration(
      webBackendUrl(),
      process.env.INTERNAL_SECRET || "",
      req.parent.id,
      "cancel",
      { id: req.params.id }
    );
    return res.json(toMobileAbsenceDeclaration(result.body));
  } catch (error) {
    const status = error instanceof AbsenceDeclarationRelayError ? error.status : 502;
    return res.status(status).json({ error: error?.message || "Impossible d\u2019annuler la d\xE9claration." });
  }
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
    if (err instanceof AbsenceJustificationAlreadyRejectedError) {
      return res.status(409).json({ error: err.message, code: err.code });
    }
    console.error("Failed to justify absence:", err);
    return res.status(500).json({
      error: "Impossible de justifier l'absence pour le moment.",
      code: "INTERNAL_ERROR"
    });
  }
});
app.put("/api/absences/:id/justify", requireAuth, requireParentRoleOnly, async (req, res) => {
  const { id } = req.params;
  const { justificationReason } = req.body;
  const parentId = req.parent.id;
  if (typeof justificationReason !== "string" || !justificationReason.trim()) {
    return res.status(400).json({
      error: "Veuillez fournir un motif de justification.",
      code: "JUSTIFICATION_REQUIRED"
    });
  }
  try {
    const updatedAbsence = await store.justifyAbsence(id, parentId, justificationReason.trim());
    if (!updatedAbsence) {
      return res.status(404).json({
        error: "Absence introuvable ou non rattach\xE9e \xE0 ce parent.",
        code: "ABSENCE_NOT_FOUND"
      });
    }
    return res.json(updatedAbsence);
  } catch (err) {
    if (err instanceof AbsenceJustificationAlreadyRejectedError) {
      return res.status(409).json({ error: err.message, code: err.code });
    }
    console.error("Failed to justify absence:", err);
    return res.status(500).json({
      error: "Impossible de justifier l'absence pour le moment.",
      code: "INTERNAL_ERROR"
    });
  }
});
app.post("/api/absences/:id/justifications", requireAuth, requireParentRoleOnly, handleAbsenceJustificationUpload, async (req, res) => {
  const { id } = req.params;
  const parentId = req.parent.id;
  const justificationReason = typeof req.body?.justificationReason === "string" ? req.body.justificationReason.trim() : "";
  const uploadedFiles = req.uploadedFiles ?? [];
  try {
    return await withTemporaryUploadCleanup(uploadedFiles, uploadStorageDir, async () => {
      if (!justificationReason) {
        return res.status(400).json({
          error: "Veuillez fournir un motif de justification.",
          code: "JUSTIFICATION_REQUIRED"
        });
      }
      if (!uploadedFiles.length) {
        return res.status(400).json({
          error: "Veuillez joindre un document justificatif valide.",
          code: "JUSTIFICATION_FILE_REQUIRED"
        });
      }
      if (uploadedFiles.length > MAX_ABSENCE_ATTACHMENT_COUNT) {
        return res.status(400).json({
          error: `Vous pouvez joindre jusqu'\xE0 ${MAX_ABSENCE_ATTACHMENT_COUNT} fichiers maximum.`,
          code: "JUSTIFICATION_FILE_LIMIT_EXCEEDED"
        });
      }
      for (const uploadedFile of uploadedFiles) {
        await forwardAbsenceJustificationToWeb(id, parentId, justificationReason, uploadedFile);
      }
      return res.status(201).json({ success: true });
    });
  } catch (err) {
    if (err instanceof AbsenceJustificationAlreadyRejectedError) {
      return res.status(409).json({ error: err.message, code: err.code });
    }
    console.error("Failed to forward absence justification to Web backend:", err?.name || "Unknown error");
    return res.status(500).json({
      error: "Le justificatif n'a pas pu \xEAtre transmis au serveur Web.",
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
  let cycleCode = null;
  let activeTerm = null;
  let termEvaluationCount = 0;
  try {
    const childIdNum = Number(childId);
    const studentResult = await dbQuery(
      `SELECT s.first_name, s.last_name, s.school_id, cls.academic_year_id,
              cy.id AS cycle_id, cy.code AS cycle_code
       FROM students s
       LEFT JOIN classes cls ON cls.id = s.class_id
       LEFT JOIN levels lvl ON lvl.id = cls.level_id
       LEFT JOIN cycles cy ON cy.id = lvl.cycle_id
       WHERE s.id = $1`,
      [childIdNum]
    );
    const studentRow = studentResult.rows[0];
    const studentName = studentRow ? `${studentRow.first_name} ${studentRow.last_name}` : "Unknown";
    cycleCode = studentRow?.cycle_code ?? null;
    const expectedPeriodType = getExpectedPeriodTypeForCycle(cycleCode);
    const termResult = expectedPeriodType && studentRow?.academic_year_id != null && studentRow.cycle_id != null ? await dbQuery(
      `SELECT st.id, st.name, COALESCE(st.period_type, template.period_type) AS period_type,
                  st.start_date, st.end_date
           FROM school_terms st
           LEFT JOIN cycle_period_templates template ON template.id = st.template_id
           WHERE (st.school_id = $1 OR st.school_id IS NULL)
             AND st.academic_year_id = $2
             AND st.is_active = true
             AND (st.cycle_id = $3 OR st.cycle_id IS NULL)
             AND COALESCE(st.period_type, template.period_type) = $4
             AND st.start_date IS NOT NULL
             AND st.end_date IS NOT NULL
             AND to_char(CURRENT_DATE, 'YYYY-MM-DD') BETWEEN st.start_date AND st.end_date
           ORDER BY (st.school_id = $1) DESC, st.start_date DESC, st.order_index DESC
           LIMIT 1`,
      [studentRow.school_id, studentRow.academic_year_id, studentRow.cycle_id, expectedPeriodType]
    ) : { rows: [] };
    activeTerm = termResult.rows[0] ?? null;
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
    const averageResult = calculateCurrentTermAverage(rawRows.rows.map((row) => ({
      evaluationId: row.evaluation_id,
      termId: row.term_id,
      subject: row.subject,
      coefficient: row.coefficient,
      maxScore: row.max_score,
      countInBulletin: row.count_in_bulletin,
      date: row.date,
      score: row.score,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })), activeTerm ? {
      id: activeTerm.id,
      startDate: activeTerm.start_date,
      endDate: activeTerm.end_date
    } : null);
    termAverage = averageResult.termAverage;
    termEvaluationCount = averageResult.termEvaluationCount;
    const { usedEvaluations, ignoredEvaluations } = averageResult;
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
  const period = activeTerm && getExpectedPeriodTypeForCycle(cycleCode) === activeTerm.period_type ? {
    id: String(activeTerm.id),
    name: activeTerm.name,
    periodType: activeTerm.period_type,
    startDate: activeTerm.start_date,
    endDate: activeTerm.end_date
  } : null;
  return res.json({ grades, cycleCode, period, termAverage, termEvaluationCount });
});
app.get("/api/mobile/parent/notifications", requireAuth, requireParentRoleOnly, async (req, res) => {
  const parentId = req.parent.id;
  const notifications = await store.getInAppNotifications(parentId);
  return res.json(notifications);
});
app.get("/api/mobile/parent/notifications/:notificationId/attachments/:attachmentId", requireAuth, requireParentRoleOnly, async (req, res) => {
  const notificationId = Number(req.params.notificationId);
  const attachmentId = Number(req.params.attachmentId);
  if (!Number.isInteger(notificationId) || !Number.isInteger(attachmentId)) {
    return res.status(404).json({ error: "Fichier non disponible." });
  }
  const attachmentAccess = await store.getInAppNotificationAttachment(req.parent.id, notificationId, attachmentId);
  if (!attachmentAccess) {
    return res.status(404).json({ error: "Fichier non disponible." });
  }
  if (!attachmentAccess.authorized) {
    return res.status(403).json({ error: "Vous n'avez pas acc\xE8s \xE0 ce fichier." });
  }
  const targetBaseUrl = webBackendUrl();
  const internalSecret = process.env.INTERNAL_SECRET;
  if (!targetBaseUrl || !internalSecret || !internalSecret.trim()) {
    console.error("Notification attachment relay is not configured");
    return res.status(502).json({ error: "Le serveur de fichiers est indisponible." });
  }
  const timestamp = Date.now().toString();
  const payload = JSON.stringify({ attachmentId: String(attachmentId) });
  const hmac = import_crypto2.default.createHmac("sha256", internalSecret);
  hmac.update(`${payload}${timestamp}`);
  const signature = hmac.digest("hex");
  let webResponse;
  try {
    webResponse = await fetch(`${targetBaseUrl}/api/internal/notification-attachment/${attachmentId}`, {
      method: "GET",
      headers: {
        "X-Internal-Timestamp": timestamp,
        "X-Internal-Signature": signature
      }
    });
  } catch (error) {
    console.error("Notification attachment relay request failed:", error?.message || error);
    return res.status(502).json({ error: "Le serveur de fichiers est indisponible." });
  }
  if (!webResponse.ok) {
    console.error("Notification attachment relay returned status:", webResponse.status);
    if (webResponse.status === 404) {
      return res.status(404).json({ error: "Fichier non disponible." });
    }
    return res.status(502).json({ error: "Le serveur de fichiers est indisponible." });
  }
  if (!webResponse.body) {
    console.error("Notification attachment relay returned an empty body");
    return res.status(502).json({ error: "Le serveur de fichiers est indisponible." });
  }
  const contentType = webResponse.headers.get("content-type");
  const contentLength = webResponse.headers.get("content-length");
  const contentDisposition = webResponse.headers.get("content-disposition");
  if (contentType) res.setHeader("Content-Type", contentType);
  if (contentLength) res.setHeader("Content-Length", contentLength);
  if (contentDisposition) res.setHeader("Content-Disposition", contentDisposition);
  const relayStream = import_stream.Readable.fromWeb(webResponse.body);
  relayStream.on("error", (error) => {
    console.error("Notification attachment relay stream failed:", error?.message || error);
  });
  return relayStream.pipe(res);
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
  const device = await store.registerPushToken(
    parentId,
    deviceId,
    pushToken,
    platform,
    appVersion
  );
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
app.post("/api/internal/absence-notification", verifyInternalAuth, async (req, res) => {
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
app.post("/api/internal/grade-notification", verifyInternalAuth, async (req, res) => {
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
app.post("/api/internal/evaluation-notification", verifyInternalAuth, async (req, res) => {
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
app.post("/api/internal/info-notification", verifyInternalAuth, async (req, res) => {
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
  await import_fs2.promises.mkdir(uploadStorageDir, { recursive: true });
  await initializeMobileTables();
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
