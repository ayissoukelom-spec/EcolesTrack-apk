/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'crypto';
import { 
  Parent, Child, Absence, Grade, AppNotification, 
  ParentDevice, NotificationPreferences, ParentConsent, 
  NotificationEvent, NotificationDelivery, NotificationChannel,
  CompleteDeliveryLog
} from '../src/types';
import { initializeMobileTables, dbQuery, pool } from './postgres';
import { mapWebParentToMobileParent, mapWebStudentToChild } from './mobileAdapter';

interface DatabaseSchema {
  parents: Array<Parent & { passwordHash: string; role: string }>;
  schools: Array<{ id: string; name: string; address: string }>;
  parentSchools: Array<{ parentId: string; schoolId: string }>;
  children: Child[];
  absences: Absence[];
  grades: Grade[];
  appNotifications: AppNotification[];
  parentDevices: ParentDevice[];
  notificationPreferences: NotificationPreferences[];
  parentConsents: ParentConsent[];
  notificationEvents: NotificationEvent[];
  notificationDeliveries: NotificationDelivery[];
}

const INITIAL_DATABASE: DatabaseSchema = {
  parents: [
    {
      id: "parent-jean-dupont",
      name: "Jean Dupont",
      email: "jean.dupont@email.com",
      phoneNumber: "+33612345678",
      activeSchoolId: "school-pasteur",
      schools: [
        { id: "school-pasteur", name: "Collège Louis Pasteur" },
        { id: "school-moliere", name: "Lycée Molière" }
      ],
      passwordHash: "parent123", // Simple plain or hashed for mockup validation
      role: "parent"
    },
    {
      id: "parent-marie-martin",
      name: "Marie Martin",
      email: "marie.martin@email.com",
      phoneNumber: "+33698765432",
      activeSchoolId: "school-pasteur",
      schools: [
        { id: "school-pasteur", name: "Collège Louis Pasteur" }
      ],
      passwordHash: "parent123",
      role: "parent"
    },
    // Admin & Teacher to demonstrate the 403 Parent-Only protection
    {
      id: "user-admin",
      name: "Directeur Académique",
      email: "admin@ecoletrack.fr",
      phoneNumber: "+33600000001",
      activeSchoolId: "school-pasteur",
      schools: [],
      passwordHash: "admin123",
      role: "school_admin"
    },
    {
      id: "user-teacher",
      name: "M. Legendre (Prof de Maths)",
      email: "teacher@ecoletrack.fr",
      phoneNumber: "+33600000002",
      activeSchoolId: "school-pasteur",
      schools: [],
      passwordHash: "teacher123",
      role: "teacher"
    }
  ],
  schools: [
    { id: "school-pasteur", name: "Collège Louis Pasteur", address: "12 Rue des Écoles, Paris" },
    { id: "school-moliere", name: "Lycée Molière", address: "45 Avenue Molière, Paris" }
  ],
  parentSchools: [
    { parentId: "parent-jean-dupont", schoolId: "school-pasteur" },
    { parentId: "parent-jean-dupont", schoolId: "school-moliere" },
    { parentId: "parent-marie-martin", schoolId: "school-pasteur" }
  ],
  children: [
    {
      id: "child-lucas",
      parentId: "parent-jean-dupont",
      firstName: "Lucas",
      lastName: "Dupont",
      className: "4ème B",
      birthDate: "2013-09-12",
      gender: "Garçon",
      avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=120"
    },
    {
      id: "child-chloe",
      parentId: "parent-jean-dupont",
      firstName: "Chloé",
      lastName: "Dupont",
      className: "6ème A",
      birthDate: "2012-11-03",
      gender: "Fille",
      avatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=120"
    },
    {
      id: "child-theo",
      parentId: "parent-marie-martin",
      firstName: "Théo",
      lastName: "Martin",
      className: "3ème C",
      birthDate: "2013-04-23",
      gender: "Garçon",
      avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=120"
    }
  ],
  absences: [
    {
      id: "abs-1",
      childId: "child-lucas",
      date: "2026-06-15T08:30:00Z",
      reason: "Gastro-entérite aiguë",
      justified: true,
      justificationText: "Certificat médical envoyé le 16/06."
    },
    {
      id: "abs-2",
      childId: "child-lucas",
      date: "2026-07-02T10:00:00Z",
      reason: "Retard injustifié cours d'Histoire",
      justified: false
    },
    {
      id: "abs-3",
      childId: "child-chloe",
      date: "2026-06-20T14:00:00Z",
      reason: "Rendez-vous orthodontiste",
      justified: true,
      justificationText: "Mot de passe signé des parents fourni en amont."
    },
    {
      id: "abs-4",
      childId: "child-theo",
      date: "2026-06-28T09:00:00Z",
      reason: "Panne de réveil",
      justified: false
    }
  ],
  grades: [
    {
      id: "grade-1",
      childId: "child-lucas",
      subject: "Mathématiques",
      grade: 15.5,
      coefficient: 2,
      examName: "Contrôle Algèbre & Fonctions",
      date: "2026-06-10"
    },
    {
      id: "grade-2",
      childId: "child-lucas",
      subject: "Français",
      grade: 12,
      coefficient: 1,
      examName: "Expression écrite - Commentaire de texte",
      date: "2026-06-14"
    },
    {
      id: "grade-3",
      childId: "child-lucas",
      subject: "Histoire-Géographie",
      grade: 14,
      coefficient: 1.5,
      examName: "Évaluation - La Première Guerre Mondiale",
      date: "2026-06-25"
    },
    {
      id: "grade-4",
      childId: "child-chloe",
      subject: "Mathématiques",
      grade: 18,
      coefficient: 1,
      examName: "Calcul mental - Tables et fractions",
      date: "2026-06-12"
    },
    {
      id: "grade-5",
      childId: "child-chloe",
      subject: "Anglais",
      grade: 16.5,
      coefficient: 1.5,
      examName: "Vocabulaire & Verbes irréguliers",
      date: "2026-06-18"
    },
    {
      id: "grade-6",
      childId: "child-chloe",
      subject: "SVT",
      grade: 9.5,
      coefficient: 1,
      examName: "Contrôle - Le système solaire",
      date: "2026-06-27"
    },
    {
      id: "grade-7",
      childId: "child-theo",
      subject: "Mathématiques",
      grade: 11,
      coefficient: 2,
      examName: "Devoir commun - Géométrie",
      date: "2026-06-20"
    }
  ],
  appNotifications: [
    {
      id: "not-1",
      parentId: "parent-jean-dupont",
      title: "Nouvelle absence signalée",
      message: "Votre enfant Lucas Dupont a été signalé absent aujourd'hui à 10:00. Veuillez fournir un justificatif.",
      read: false,
      createdAt: "2026-07-02T10:15:00Z",
      deepLink: "ecoletrack://absences?childId=child-lucas"
    },
    {
      id: "not-2",
      parentId: "parent-jean-dupont",
      title: "Nouvelle note disponible",
      message: "Lucas Dupont a reçu un 14/20 en Histoire-Géographie (Coeff 1.5).",
      read: true,
      createdAt: "2026-06-25T16:00:00Z",
      deepLink: "ecoletrack://grades?childId=child-lucas"
    }
  ],
  parentDevices: [],
  notificationPreferences: [
    {
      parentId: "parent-jean-dupont",
      pushEnabled: true,
      whatsappEnabled: true,
      smsEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00"
    },
    {
      parentId: "parent-marie-martin",
      pushEnabled: true,
      whatsappEnabled: false,
      smsEnabled: true,
      quietHoursStart: "21:30",
      quietHoursEnd: "07:30"
    }
  ],
  parentConsents: [
    {
      id: "c-1",
      parentId: "parent-jean-dupont",
      channel: "whatsapp",
      consentGranted: true,
      consentTextVersion: "v1.0-fr",
      consentedAt: "2026-05-01T10:00:00Z"
    },
    {
      id: "c-2",
      parentId: "parent-jean-dupont",
      channel: "sms",
      consentGranted: false,
      consentTextVersion: "v1.0-fr",
      consentedAt: "2026-05-01T10:00:00Z",
      revokedAt: "2026-06-01T15:30:00Z"
    },
    {
      id: "c-3",
      parentId: "parent-marie-martin",
      channel: "sms",
      consentGranted: true,
      consentTextVersion: "v1.0-fr",
      consentedAt: "2026-05-15T11:00:00Z"
    }
  ],
  notificationEvents: [],
  notificationDeliveries: []
};

export class PostgresStore {
  constructor() {
    void initializeMobileTables();
  }

  private async ensureParentRecord(parentId: string): Promise<Parent | null> {
    const { rows } = await dbQuery<{ user_id: number; email: string; name: string; role: string; school_id: number | null; phone: string | null }>(`
      SELECT u.id AS user_id, u.email, u.name, u.role, u.school_id, p.phone
      FROM users u
      LEFT JOIN parents p ON p.user_id = u.id
      WHERE u.id = $1
    `, [Number(parentId)]);

    if (rows.length === 0) return null;

    const row = rows[0];
    const schoolRows = await dbQuery<{ id: number; name: string }>(`
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
      role: row.role,
    }) as Parent;
  }

  private async getParentByEmail(email: string): Promise<(Parent & { passwordHash: string; role: string; salt?: string }) | null> {
    const { rows } = await dbQuery<{ user_id: number; email: string; name: string; role: string; phone: string | null; school_id: number | null; password_hash: string | null; salt: string | null }>(`
      SELECT u.id AS user_id, u.email, u.name, u.role, p.phone, u.school_id, la.password_hash, la.salt
      FROM users u
      LEFT JOIN parents p ON p.user_id = u.id
      LEFT JOIN local_auths la ON la.user_id = u.id
      WHERE LOWER(u.email) = LOWER($1)
      LIMIT 1
    `, [email]);

    if (rows.length === 0) return null;

    const row = rows[0];
    const schoolRows = await dbQuery<{ id: number; name: string }>(`
      SELECT s.id, s.name
      FROM user_schools us
      JOIN schools s ON s.id = us.school_id
      WHERE us.user_id = $1 AND us.is_active = true
    `, [row.user_id]);

    const parent: Parent & { passwordHash: string; role: string; salt?: string } = {
      ...(mapWebParentToMobileParent({
        userId: row.user_id,
        userEmail: row.email,
        userName: row.name,
        userPhone: row.phone ?? null,
        activeSchoolId: row.school_id ?? null,
        schoolMemberships: schoolRows.rows.map((school) => ({ id: school.id, name: school.name })),
        role: row.role,
      }) as Parent),
      passwordHash: row.password_hash ?? '',
      role: row.role,
      salt: row.salt ?? undefined,
    };

    return parent;
  }

  public async findParentByEmail(email: string) {
    return this.getParentByEmail(email);
  }

  public async verifyParentPassword(email: string, password: string): Promise<boolean> {
    const user = await this.getParentByEmail(email);
    if (!user || !user.passwordHash || !user.salt) {
      return false;
    }

    const verifyHash = crypto.pbkdf2Sync(password, user.salt, 310000, 64, 'sha512').toString('hex');
    return verifyHash === user.passwordHash;
  }

  public async getParentById(id: string) {
    return this.ensureParentRecord(id);
  }

  public async getChildrenOfParent(parentId: string): Promise<Child[]> {
    const userId = Number(parentId);
    if (!Number.isInteger(userId)) return [];

    const { rows } = await dbQuery<{ id: number; first_name: string; last_name: string; birth_date: string | null; parent_id: number | null; class_name: string | null }>(`
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
      birthDate: row.birth_date ?? '',
      parentId: row.parent_id ?? null,
      className: row.class_name ?? '',
    }));
  }

  public async createSimulatedChildForParent(parentId: string): Promise<Child | null> {
    const parent = await this.getParentById(parentId);
    if (!parent) {
      return null;
    }

    return {
      id: `child-sim-${crypto.randomUUID().slice(0, 8)}`,
      parentId,
      firstName: 'Élève',
      lastName: 'Demo',
      className: '5ème Demo',
      birthDate: '2013-09-01',
      avatarUrl: '',
    };
  }

  public async isChildOwnedByParent(childId: string, parentId: string): Promise<boolean> {
    const parentUserId = Number(parentId);
    const childIdNum = Number(childId);
    if (!Number.isInteger(parentUserId) || !Number.isInteger(childIdNum)) return false;

    const { rows } = await dbQuery<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM students s
      JOIN parents p ON p.id = s.parent_id
      WHERE s.id = $1 AND p.user_id = $2
    `, [childIdNum, parentUserId]);

    return Number(rows[0]?.count ?? 0) > 0;
  }

  public async addAbsence(absence: Omit<Absence, 'id'>): Promise<Absence> {
    const childIdNum = Number(absence.childId);
    if (!Number.isInteger(childIdNum)) {
      throw new Error('Invalid child id for absence insertion');
    }

    const studentRow = await dbQuery<{ class_id: number | null }>(`SELECT class_id FROM students WHERE id = $1`, [childIdNum]);
    const classId = studentRow.rows[0]?.class_id ?? null;

    const { rows } = await dbQuery<{ id: number }>(`
      INSERT INTO absences (student_id, class_id, date, period, is_justified, justification_reason)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [childIdNum, classId, absence.date, 'all_day', absence.justified, absence.justificationText ?? null]);

    return {
      id: String(rows[0]?.id ?? 0),
      ...absence,
    };
  }

  public async getAbsencesOfChild(childId: string): Promise<Absence[]> {
    const childIdNum = Number(childId);
    if (!Number.isInteger(childIdNum)) return [];

    const { rows } = await dbQuery<{ id: number; date: string; period: string | null; is_justified: boolean; justification_reason: string | null }>(`
      SELECT id, date, period, is_justified, justification_reason
      FROM absences
      WHERE student_id = $1
    `, [childIdNum]);

    return rows.map((row) => ({
      id: String(row.id),
      childId,
      date: row.date,
      reason: row.justification_reason ?? (row.is_justified ? 'Absence justifiée' : 'Absence non justifiée'),
      justified: row.is_justified,
      justificationText: row.justification_reason ?? undefined,
    }));
  }

  public async addGrade(grade: Omit<Grade, 'id'>): Promise<Grade> {
    const childIdNum = Number(grade.childId);
    if (!Number.isInteger(childIdNum)) {
      throw new Error('Invalid child id for grade insertion');
    }

    const studentRow = await dbQuery<{ class_id: number | null }>(`SELECT class_id FROM students WHERE id = $1`, [childIdNum]);
    const classId = studentRow.rows[0]?.class_id ?? null;
    const teacherRow = await dbQuery<{ id: number }>(`SELECT id FROM teachers LIMIT 1`);
    const teacherId = teacherRow.rows[0]?.id ?? 1;

    const evaluationRow = await dbQuery<{ id: number }>(`
      INSERT INTO evaluations (class_id, teacher_id, subject, title, coefficient, max_score, count_in_bulletin, date)
      VALUES ($1, $2, $3, $4, $5, $6, true, $7)
      RETURNING id
    `, [classId, teacherId, grade.subject, grade.examName, Math.max(1, Math.round(grade.coefficient)), 20, grade.date]);

    const evaluationId = evaluationRow.rows[0]?.id;
    if (!evaluationId) {
      throw new Error('Failed to create evaluation record for grade insertion');
    }

    const { rows } = await dbQuery<{ id: number }>(`
      INSERT INTO grades (evaluation_id, student_id, score, remarks, edit_count, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 0, NOW(), NOW())
      RETURNING id
    `, [evaluationId, childIdNum, String(grade.grade), '', 0]);

    return {
      id: String(rows[0]?.id ?? 0),
      ...grade,
    };
  }

  public async getGradesOfChild(childId: string): Promise<Grade[]> {
    const childIdNum = Number(childId);
    if (!Number.isInteger(childIdNum)) return [];

    const { rows } = await dbQuery<{ id: number; subject: string; score: string; coefficient: number | null; title: string; date: string }>(`
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
      date: row.date,
    }));
  }

  public async getInAppNotifications(parentId: string): Promise<AppNotification[]> {
    const userId = Number(parentId);
    if (!Number.isInteger(userId)) return [];

    const { rows } = await dbQuery<{ id: number; title: string; body: string; is_read: boolean; created_at: string }>(`
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
      deepLink: undefined,
    }));
  }

  public async markAllInAppNotificationsAsRead(parentId: string) {
    const userId = Number(parentId);
    if (!Number.isInteger(userId)) return;

    await dbQuery(`
      UPDATE notifications
      SET is_read = true
      WHERE user_id = $1
    `, [userId]);
  }

  public async addInAppNotification(parentId: string, title: string, message: string, deepLink?: string): Promise<AppNotification> {
    const userId = Number(parentId);
    if (!Number.isInteger(userId)) {
      throw new Error('Invalid parent id for notification insertion');
    }

    const { rows } = await dbQuery<{ id: number }>(`
      INSERT INTO notifications (user_id, title, body, type, is_read, created_at)
      VALUES ($1, $2, $3, $4, false, NOW())
      RETURNING id
    `, [userId, title, message, 'info']);

    return {
      id: String(rows[0]?.id ?? 0),
      parentId,
      title,
      message,
      read: false,
      createdAt: new Date().toISOString(),
      deepLink,
    };
  }

  public async registerPushToken(parentId: string, token: string, platform: 'android' | 'ios', appVersion: string): Promise<ParentDevice> {
    const { rows } = await dbQuery<{ id: number }>(`
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
      lastSeenAt: new Date().toISOString(),
    };
  }

  public async getDevicesOfParent(parentId: string): Promise<ParentDevice[]> {
    const { rows } = await dbQuery<{ id: number; platform: 'android' | 'ios'; push_token: string; app_version: string; last_seen_at: string }>(`
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
      lastSeenAt: row.last_seen_at,
    }));
  }

  public async getNotificationPreferences(parentId: string): Promise<NotificationPreferences> {
    const { rows } = await dbQuery<{ push_enabled: boolean; whatsapp_enabled: boolean; sms_enabled: boolean; quiet_hours_start: string; quiet_hours_end: string }>(`
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
        quietHoursEnd: row.quiet_hours_end,
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
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
    };
  }

  public async updateNotificationPreferences(parentId: string, updates: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
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

  public async getConsentsOfParent(parentId: string): Promise<ParentConsent[]> {
    const { rows } = await dbQuery<{ id: number; channel: 'whatsapp' | 'sms'; consent_granted: boolean; consent_text_version: string; consented_at: string; revoked_at: string | null }>(`
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
      revokedAt: row.revoked_at ?? undefined,
    }));
  }

  public async updateConsent(parentId: string, channel: 'whatsapp' | 'sms', granted: boolean, textVersion: string): Promise<ParentConsent> {
    const timestamp = new Date().toISOString();
    const { rows } = await dbQuery<{ id: number }>(`
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
      consentedAt: timestamp,
    };
  }

  public async createNotificationEvent(parentId: string, eventType: 'absence' | 'grade' | 'general' | 'test', payload: any, dedupeKey: string): Promise<NotificationEvent | null> {
    const existing = await dbQuery<{ id: number }>(`SELECT id FROM mobile_notification_events WHERE dedupe_key = $1`, [dedupeKey]);
    if (existing.rows.length > 0) {
      return null;
    }

    const { rows } = await dbQuery<{ id: number }>(`
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
      createdAt: new Date().toISOString(),
    };
  }

  public async addNotificationDelivery(delivery: Omit<NotificationDelivery, 'id'>): Promise<NotificationDelivery> {
    const { rows } = await dbQuery<{ id: number }>(`
      INSERT INTO mobile_notification_deliveries (event_id, channel, provider, status, attempts, provider_message_id, error_code, error_message, sent_at, delivered_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [Number(delivery.eventId), delivery.channel, delivery.provider, delivery.status, delivery.attempts, delivery.providerMessageId ?? null, delivery.errorCode ?? null, delivery.errorMessage ?? null, delivery.sentAt ?? null, delivery.deliveredAt ?? null]);

    return {
      ...delivery,
      id: String(rows[0]?.id ?? 0),
    } as NotificationDelivery;
  }

  public async updateNotificationDeliveryStatus(id: string, updates: Partial<NotificationDelivery>) {
    const deliveryId = Number(id);
    if (!Number.isInteger(deliveryId)) return;

    const fields: string[] = [];
    const values: any[] = [];
    const map: Record<string, string> = {
      status: 'status',
      attempts: 'attempts',
      providerMessageId: 'provider_message_id',
      errorCode: 'error_code',
      errorMessage: 'error_message',
      sentAt: 'sent_at',
      deliveredAt: 'delivered_at',
    };

    Object.entries(updates).forEach(([key, value]) => {
      const column = map[key];
      if (!column || value === undefined) return;
      fields.push(`${column} = $${fields.length + 2}`);
      values.push(value);
    });

    if (fields.length === 0) return;
    await dbQuery(`UPDATE mobile_notification_deliveries SET ${fields.join(', ')} WHERE id = $1`, [deliveryId, ...values]);
  }

  public async getCompleteDeliveryLogs(): Promise<CompleteDeliveryLog[]> {
    const { rows } = await dbQuery<{ id: number; parent_id: string; event_type: string; payload_json: string; dedupe_key: string; created_at: string }>(`
      SELECT id, parent_id, event_type, payload_json, dedupe_key, created_at
      FROM mobile_notification_events
      ORDER BY created_at DESC
    `);

    const result: CompleteDeliveryLog[] = [];
    for (const event of rows) {
      const deliveries = await dbQuery<{ id: number; event_id: number; channel: string; provider: string; status: string; attempts: number; provider_message_id: string | null; error_code: string | null; error_message: string | null; sent_at: string | null; delivered_at: string | null }>(`
        SELECT id, event_id, channel, provider, status, attempts, provider_message_id, error_code, error_message, sent_at, delivered_at
        FROM mobile_notification_deliveries
        WHERE event_id = $1
        ORDER BY id ASC
      `, [event.id]);

      result.push({
        event: {
          id: String(event.id),
          parentId: event.parent_id,
          eventType: event.event_type as any,
          payloadJson: event.payload_json,
          dedupeKey: event.dedupe_key,
          createdAt: event.created_at,
        },
        deliveries: deliveries.rows.map((row) => ({
          id: String(row.id),
          eventId: String(row.event_id),
          channel: row.channel as NotificationChannel,
          provider: row.provider as any,
          status: row.status as any,
          attempts: row.attempts,
          providerMessageId: row.provider_message_id ?? undefined,
          errorCode: row.error_code ?? undefined,
          errorMessage: row.error_message ?? undefined,
          sentAt: row.sent_at ?? undefined,
          deliveredAt: row.delivered_at ?? undefined,
        })),
      });
    }

    return result;
  }

  public async clearAllLogs() {
    await dbQuery(`DELETE FROM mobile_notification_deliveries`);
    await dbQuery(`DELETE FROM mobile_notification_events`);
    await dbQuery(`DELETE FROM notifications WHERE title LIKE 'test-%' OR body LIKE 'test-%'`);
  }
}

// Global store instance
export const store = new PostgresStore();

// ====================================================================
// ORCHESTRATEUR DE NOTIFICATIONS MULTI-CANAUX (SIMULATION BULLMQ)
// ====================================================================
// This background worker processes notification events from our queue
// and executes priorities, consent validation, and channel fallbacks.
export async function triggerMultiChannelNotification(
  parentId: string, 
  title: string, 
  message: string, 
  eventType: 'absence' | 'grade' | 'general' | 'test',
  payload: any,
  dedupeKey: string
) {
  const appNotif = await store.addInAppNotification(parentId, title, message, payload.deepLink);

  const event = await store.createNotificationEvent(parentId, eventType, payload, dedupeKey);
  if (!event) {
    return { status: 'deduplicated', reason: 'Deduplication key triggered' };
  }

  const prefs = await store.getNotificationPreferences(parentId);
  const consents = await store.getConsentsOfParent(parentId);
  const parentObj = await store.getParentById(parentId);

  if (!parentObj) {
    return { status: 'failed', reason: 'Parent not found' };
  }

  // Helper check: Is consent active for a channel?
  const hasConsent = (channel: 'whatsapp' | 'sms') => {
    const channelConsents = consents.filter(c => c.channel === channel);
    if (channelConsents.length === 0) return false;
    // Sorted by time, last active consent controls
    const last = channelConsents[channelConsents.length - 1];
    return last.consentGranted && !last.revokedAt;
  };

  // Helper check: Is quiet hours active?
  const isQuietHours = () => {
    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeInMinutes = currentHours * 60 + currentMinutes;

    const parseTimeToMinutes = (timeStr: string) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };

    const startMinutes = parseTimeToMinutes(prefs.quietHoursStart);
    const endMinutes = parseTimeToMinutes(prefs.quietHoursEnd);

    if (startMinutes > endMinutes) {
      // Overnight e.g. 22:00 to 07:00
      return currentTimeInMinutes >= startMinutes || currentTimeInMinutes <= endMinutes;
    } else {
      // Normal range e.g. 13:00 to 14:00
      return currentTimeInMinutes >= startMinutes && currentTimeInMinutes <= endMinutes;
    }
  };

  // 3. Initiate Notification Deliveries Queue Sequence
  // Core logic:
  // - Push is Priority 1.
  // - Fallback to WhatsApp if Push is disabled or fails, and user gave WhatsApp consent.
  // - Fallback to SMS if WhatsApp is disabled or fails, and user gave SMS consent.
  // - If quiet hours is active, SMS and WhatsApp might be delayed/blocked, but we will process them as "failed (quiet hours)" or log it.

  console.log(`[NOTIF ORCHESTRATOR] Processing notification for ${parentObj.name} (Event ID: ${event.id})`);

  let pushDelivered = false;
  let whatsappDelivered = false;
  let smsDelivered = false;

  // Track if quiet hours limits delivery
  const isQuiet = isQuietHours();

  // --- CHANNEL 1: PUSH (FCM) ---
  const pushDelivery = await store.addNotificationDelivery({
    eventId: event.id,
    channel: 'push',
    provider: 'fcm',
    status: 'queued',
    attempts: 0
  });

  if (prefs.pushEnabled) {
    const devices = await store.getDevicesOfParent(parentId);
    await store.updateNotificationDeliveryStatus(pushDelivery.id, { attempts: 1 });

    if (devices.length > 0) {
      // Simulating FCM Cloud trigger
      const hasAndroidDevice = devices.some(d => d.platform === 'android');
      
      // Let's mark as delivered!
      await store.updateNotificationDeliveryStatus(pushDelivery.id, {
        status: 'delivered',
        providerMessageId: `fcm-msg-${crypto.randomUUID().slice(0, 8)}`,
        sentAt: new Date().toISOString(),
        deliveredAt: new Date().toISOString()
      });
      pushDelivered = true;
      console.log(`[FCM PUSH] Delivered successfully to ${devices.length} registered devices.`);
    } else {
      // No devices registered, Push is "failed" due to no registered devices
      await store.updateNotificationDeliveryStatus(pushDelivery.id, {
        status: 'failed',
        errorCode: 'NO_DEVICES_REGISTERED',
        errorMessage: 'Parent registered push but has no active session on device.'
      });
      console.log(`[FCM PUSH] Failed: No devices registered.`);
    }
  } else {
    // Push is disabled by parent
    await store.updateNotificationDeliveryStatus(pushDelivery.id, {
      status: 'failed',
      errorCode: 'PUSH_DISABLED',
      errorMessage: 'Push notifications are disabled in parent preferences.'
    });
    console.log(`[FCM PUSH] Skipped: push is disabled by user.`);
  }

  // --- CHANNEL 2: FALLBACK TO WHATSAPP ---
  // Triggered only if Push was not delivered and WhatsApp is preferred/enabled
  if (!pushDelivered) {
    const waDelivery = await store.addNotificationDelivery({
      eventId: event.id,
      channel: 'whatsapp',
      provider: 'whatsapp_cloud_api',
      status: 'queued',
      attempts: 0
    });

    if (prefs.whatsappEnabled) {
      await store.updateNotificationDeliveryStatus(waDelivery.id, { attempts: 1 });
      
      if (!hasConsent('whatsapp')) {
        await store.updateNotificationDeliveryStatus(waDelivery.id, {
          status: 'failed',
          errorCode: 'CONSENT_MISSING',
          errorMessage: 'WhatsApp consent not given or explicitly revoked.'
        });
        console.log(`[WHATSAPP] Failed: No active consent recorded.`);
      } else if (isQuiet) {
        await store.updateNotificationDeliveryStatus(waDelivery.id, {
          status: 'failed',
          errorCode: 'QUIET_HOURS_BLOCKED',
          errorMessage: `Delivery blocked by Quiet Hours (${prefs.quietHoursStart} - ${prefs.quietHoursEnd}).`
        });
        console.log(`[WHATSAPP] Blocked: Quiet hours active.`);
      } else {
        // Successful simulation of WhatsApp Cloud Template API
        await store.updateNotificationDeliveryStatus(waDelivery.id, {
          status: 'delivered',
          providerMessageId: `wa-msg-${crypto.randomUUID().slice(0, 8)}`,
          sentAt: new Date().toISOString(),
          deliveredAt: new Date().toISOString()
        });
        whatsappDelivered = true;
        console.log(`[WHATSAPP] Template message delivered to ${parentObj.phoneNumber}.`);
      }
    } else {
      await store.updateNotificationDeliveryStatus(waDelivery.id, {
        status: 'failed',
        errorCode: 'CHANNEL_DISABLED',
        errorMessage: 'WhatsApp notifications are disabled in parent preferences.'
      });
      console.log(`[WHATSAPP] Skipped: Channel disabled.`);
    }
  }

  // --- CHANNEL 3: FALLBACK TO SMS ---
  // Triggered only if both Push AND WhatsApp failed to deliver, and SMS is preferred/enabled
  if (!pushDelivered && !whatsappDelivered) {
    const smsDelivery = await store.addNotificationDelivery({
      eventId: event.id,
      channel: 'sms',
      provider: 'twilio_sms',
      status: 'queued',
      attempts: 0
    });

    if (prefs.smsEnabled) {
      await store.updateNotificationDeliveryStatus(smsDelivery.id, { attempts: 1 });
      
      if (!hasConsent('sms')) {
        await store.updateNotificationDeliveryStatus(smsDelivery.id, {
          status: 'failed',
          errorCode: 'CONSENT_MISSING',
          errorMessage: 'SMS consent not given or explicitly revoked.'
        });
        console.log(`[SMS] Failed: No active consent recorded.`);
      } else if (isQuiet) {
        await store.updateNotificationDeliveryStatus(smsDelivery.id, {
          status: 'failed',
          errorCode: 'QUIET_HOURS_BLOCKED',
          errorMessage: `Delivery blocked by Quiet Hours (${prefs.quietHoursStart} - ${prefs.quietHoursEnd}).`
        });
        console.log(`[SMS] Blocked: Quiet hours active.`);
      } else {
        // Successful simulation of SMS Gateway
        await store.updateNotificationDeliveryStatus(smsDelivery.id, {
          status: 'delivered',
          providerMessageId: `sms-msg-${crypto.randomUUID().slice(0, 8)}`,
          sentAt: new Date().toISOString(),
          deliveredAt: new Date().toISOString()
        });
        smsDelivered = true;
        console.log(`[SMS] Delivered SMS to ${parentObj.phoneNumber}.`);
      }
    } else {
      await store.updateNotificationDeliveryStatus(smsDelivery.id, {
        status: 'failed',
        errorCode: 'CHANNEL_DISABLED',
        errorMessage: 'SMS notifications are disabled in parent preferences.'
      });
      console.log(`[SMS] Skipped: Channel disabled.`);
    }
  }

  return {
    status: 'processed',
    appNotificationId: appNotif.id,
    eventId: event.id,
    deliverySummary: {
      push: pushDelivered ? 'delivered' : 'skipped_or_failed',
      whatsapp: whatsappDelivered ? 'delivered' : 'skipped_or_failed',
      sms: smsDelivered ? 'delivered' : 'skipped_or_failed'
    }
  };
}
