/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response, NextFunction } from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { store } from "./backend/store";
import { dbQuery } from "./backend/postgres";
import { helmetHeaders, requestIdMiddleware, sanitizePayload } from "./backend/middlewares/security";
import { Logger } from "./backend/utils/logger";
import { AuthService } from "./backend/services/auth";
import { NotificationService } from "./backend/services/notification";
import { QueueManager } from "./backend/jobs/queue";
import { LoginSchema, RegisterPushTokenSchema, NotificationPreferencesSchema, TestNotificationSchema } from "./backend/validators/schemas";

const logger = new Logger("ExpressServer");

// Extended Express Request to hold parent session info
interface AuthenticatedRequest extends Request {
  parent?: {
    id: string;
    email: string;
    role: string;
  };
  requestId?: string;
}

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(express.json());

// Enable security headers, Request ID traceability, and XSS payload sanitization
app.use(helmetHeaders);
app.use(requestIdMiddleware as any);
app.use(sanitizePayload);

// CORS configuration to allow mobile headers and origins
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// ====================================================================
// CRYPTO-JWT HELPER
// ====================================================================
const JWT_SECRET = "ecoletrack-super-secret-key-2026";

function generateToken(payload: { parentId: string; role: string }): string {
  // Use AuthService to keep session management synchronized
  const { accessToken } = AuthService.createSession(payload.parentId, payload.role);
  return accessToken;
}

function verifyToken(token: string): { parentId: string; role: string } | null {
  // Check using AuthService (which also parses legacy tokens if using the same secret)
  return AuthService.verifyJWT(token) as any;
}

// ====================================================================
// SECURITY & AUTHENTICATION MIDDLEWARES
// ====================================================================

// Simple Rate Limiter to guard auth and notification routes
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
function rateLimit(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "global";
    const now = Date.now();
    const clientLimit = rateLimitMap.get(ip);
    
    if (!clientLimit || now > clientLimit.resetTime) {
      rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    clientLimit.count++;
    if (clientLimit.count > limit) {
      return res.status(429).json({
        error: "Trop de requêtes. Veuillez patienter avant de réessayer.",
        code: "TOO_MANY_REQUESTS",
        details: { resetInSeconds: Math.ceil((clientLimit.resetTime - now) / 1000) }
      });
    }
    next();
  };
}

// Authentication check
const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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
      error: "Session invalide ou expirée. Veuillez vous reconnecter.",
      code: "INVALID_SESSION"
    });
  }

  req.parent = {
    id: decoded.parentId,
    email: "", // Loaded dynamically if needed
    role: decoded.role
  };
  
  next();
};

// Strict parental check
const requireParentRoleOnly = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  console.log("[AUTH_DEBUG] requireParentRoleOnly parent role:", req.parent?.role, "url:", req.originalUrl);
  if (!req.parent || req.parent.role !== "parent") {
    // Audit trace logging
    console.warn(`[SECURITY VIOLATION] Attempted access with non-parent role: ${req.parent?.role || 'none'} on URL: ${req.originalUrl}`);
    return res.status(403).json({
      error: "Accès refusé. Cette application est strictement réservée aux parents d'élèves.",
      code: "PARENTS_ONLY"
    });
  }
  next();
};

// ====================================================================
// PARENTAL MOBILE REST ENDPOINTS (12 ENDPOINTS REQUIRED)
// ====================================================================

// 1. POST /api/mobile/parent/login
app.post("/api/mobile/parent/login", rateLimit(15, 60000), async (req, res) => {
  const validation = LoginSchema.safeParse(req.body);
  if (!validation.success) {
    logger.warn("Échec de la validation Zod sur la route d'authentification.");
    return res.status(400).json({
      error: "Données de connexion invalides.",
      code: "BAD_REQUEST",
      details: validation.error.format()
    });
  }

  const { email, password } = validation.data;

  const user = await store.findParentByEmail(email);
  if (!user) {
    logger.warn(`Tentative de connexion infructueuse (utilisateur inconnu): ${email}`);
    return res.status(401).json({
      error: "Identifiants de connexion incorrects.",
      code: "BAD_CREDENTIALS"
    });
  }

  const isPasswordValid = await store.verifyParentPassword(email, password);
  if (!isPasswordValid) {
    logger.warn(`Mot de passe incorrect pour le compte parent: ${email}`);
    return res.status(401).json({
      error: "Identifiants de connexion incorrects.",
      code: "BAD_CREDENTIALS"
    });
  }

  if (user.role !== "parent") {
    logger.audit("NON_PARENT_LOGIN_REJECT", user.id, { email, role: user.role }, "FAILURE");
    return res.status(403).json({
      error: "Accès mobile réservé aux parents.",
      code: "PARENTS_ONLY",
      details: { role: user.role }
    });
  }

  let localMustReset = false;
  if (typeof user.mustReset !== "undefined" && user.mustReset !== null) {
    localMustReset = Boolean(user.mustReset);
  } else if (user.passwordHash && user.salt) {
    try {
      const defaultHash = crypto.pbkdf2Sync("123456", user.salt, 310000, 64, "sha512").toString("hex");
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

  logger.audit("PARENT_LOGIN_SUCCESS", user.id, { email, mustReset: localMustReset }, "SUCCESS");
  return res.json({
    parent: parentDetails,
    token: session.accessToken,
    refreshToken: session.refreshToken,
    mustReset: localMustReset
  });
});

app.post("/api/mobile/parent/change-password", rateLimit(15, 60000), async (req, res) => {
  const { email, currentPassword, newPassword } = req.body ?? {};
  if (!email || !currentPassword || !newPassword) {
    return res.status(400).json({
      error: "Email, mot de passe actuel et nouveau mot de passe sont requis.",
      code: "BAD_REQUEST"
    });
  }

  if (newPassword === "123456") {
    return res.status(400).json({
      error: "Le nouveau mot de passe ne peut pas être le mot de passe par défaut.",
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

  const newSalt = crypto.randomBytes(16).toString("hex");
  const newHash = crypto.pbkdf2Sync(newPassword, newSalt, 310000, 64, "sha512").toString("hex");
  await dbQuery(`UPDATE local_auths SET password_hash = $1, salt = $2, must_reset = false WHERE user_id = $3`, [newHash, newSalt, Number(user.id)]);

  logger.audit("PARENT_CHANGE_PASSWORD", user.id, { email }, "SUCCESS");
  return res.json({ success: true });
});

// 1b. POST /api/mobile/parent/refresh-token (Refresh Token Rotation - RTR)
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
    logger.warn("Échec de rotation du Jeton de Rafraîchissement. Token expiré, compromis ou invalide.");
    return res.status(401).json({
      error: "Session invalide ou expirée. Veuillez vous reconnecter.",
      code: "INVALID_SESSION"
    });
  }

  logger.info("Rotation du jeton de session effectuée avec succès.");
  return res.json(newSession);
});

// 2. POST /api/mobile/parent/logout
app.post("/api/mobile/parent/logout", requireAuth, requireParentRoleOnly, async (req: AuthenticatedRequest, res) => {
  const parentId = req.parent!.id;
  const { refreshToken, deviceId, pushToken } = req.body ?? {};

  if (refreshToken) {
    AuthService.revokeSession(parentId, refreshToken);
  } else {
    AuthService.revokeAllSessions(parentId);
  }

  if (pushToken || deviceId) {
    await store.deletePushToken(parentId, typeof pushToken === 'string' ? pushToken : undefined, typeof deviceId === 'string' ? deviceId : undefined);
  }

  logger.audit("PARENT_LOGOUT", parentId, { parentId, deviceId: typeof deviceId === 'string' ? deviceId : undefined }, "SUCCESS");
  return res.json({
    success: true,
    message: "Déconnexion réussie avec succès."
  });
});

// 3. GET /api/mobile/parent/me
app.get("/api/mobile/parent/me", requireAuth, requireParentRoleOnly, async (req: AuthenticatedRequest, res) => {
  const parentId = req.parent!.id;
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

// 4. GET /api/mobile/parent/children
app.get("/api/mobile/parent/children", requireAuth, requireParentRoleOnly, async (req: AuthenticatedRequest, res) => {
  const parentId = req.parent!.id;
  const children = await store.getChildrenOfParent(parentId);
  return res.json(children);
});

// 4b. POST /api/mobile/parent/children/simulate
app.post("/api/mobile/parent/children/simulate", requireAuth, requireParentRoleOnly, async (req: AuthenticatedRequest, res) => {
  const parentId = req.parent!.id;
  const child = await store.createSimulatedChildForParent(parentId);

  if (!child) {
    return res.status(400).json({
      error: "Impossible de simuler un enfant pour ce compte.",
      code: "SIMULATION_FAILED"
    });
  }

  return res.status(201).json(child);
});

// 5. GET /api/mobile/parent/children/:childId/absences
app.get("/api/mobile/parent/children/:childId/absences", requireAuth, requireParentRoleOnly, async (req: AuthenticatedRequest, res) => {
  const { childId } = req.params;
  const parentId = req.parent!.id;

  if (!(await store.isChildOwnedByParent(childId, parentId))) {
    return res.status(403).json({
      error: "Accès refusé. Cet enfant ne vous est pas rattaché.",
      code: "CHILD_OWNERSHIP_VIOLATION"
    });
  }

  const absences = await store.getAbsencesOfChild(childId);
  return res.json(absences);
});

// 5b. PUT /api/absences/:absenceId/justify
app.put("/api/absences/:absenceId/justify", requireAuth, requireParentRoleOnly, async (req: AuthenticatedRequest, res) => {
  const { absenceId } = req.params;
  const { justificationReason } = req.body;
  const parentId = req.parent!.id;

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
        error: "Absence introuvable ou non rattachée à ce parent.",
        code: "ABSENCE_NOT_FOUND"
      });
    }

    return res.json(updatedAbsence);
  } catch (err: any) {
    console.error("Failed to justify absence:", err);
    return res.status(500).json({
      error: "Impossible de justifier l'absence pour le moment.",
      code: "INTERNAL_ERROR"
    });
  }
});

// 6. GET /api/mobile/parent/children/:childId/grades
app.get("/api/mobile/parent/children/:childId/grades", requireAuth, requireParentRoleOnly, async (req: AuthenticatedRequest, res) => {
  const { childId } = req.params;
  const parentId = req.parent!.id;

  if (!(await store.isChildOwnedByParent(childId, parentId))) {
    return res.status(403).json({
      error: "Accès refusé. Cet enfant ne vous est pas rattaché.",
      code: "CHILD_OWNERSHIP_VIOLATION"
    });
  }

  const grades = await store.getGradesOfChild(childId);
  let termAverage: number | null = null;

  try {
    const childIdNum = Number(childId);
    const studentResult = await dbQuery<{ first_name: string; last_name: string; school_id: number | null }>(
      `SELECT first_name, last_name, school_id FROM students WHERE id = $1`,
      [childIdNum]
    );
    const studentRow = studentResult.rows[0];
    const studentName = studentRow ? `${studentRow.first_name} ${studentRow.last_name}` : 'Unknown';

    const termResult = studentRow?.school_id != null
      ? await dbQuery<{ id: number; name: string }>(
          `SELECT id, name FROM school_terms WHERE school_id = $1 AND is_active = true ORDER BY order_index DESC LIMIT 1`,
          [studentRow.school_id]
        )
      : { rows: [] };

    const activeTerm = termResult.rows[0] ?? null;
    const termName = activeTerm ? activeTerm.name : 'Aucun terme actif';

    const rawRows = await dbQuery<{
      evaluation_id: number;
      term_id: number | null;
      subject: string;
      title: string;
      coefficient: number | null;
      max_score: number | null;
      count_in_bulletin: boolean | null;
      date: string;
      grade_id: number;
      score: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT e.id AS evaluation_id, e.term_id, e.subject, e.title, e.coefficient, e.max_score, e.count_in_bulletin,
              e.date, g.id AS grade_id, g.score, g.created_at, g.updated_at
       FROM grades g
       JOIN evaluations e ON e.id = g.evaluation_id
       WHERE g.student_id = $1`,
      [childIdNum]
    );

    const gradesByEvaluation = new Map<number, typeof rawRows.rows>();
    rawRows.rows.forEach((row) => {
      const existing = gradesByEvaluation.get(row.evaluation_id) ?? [];
      existing.push(row);
      gradesByEvaluation.set(row.evaluation_id, existing);
    });

    const usedEvaluations: string[] = [];
    const ignoredEvaluations: string[] = [];
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

        const rawScore = latestGrade.score.trim().replace(',', '.');
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

        const normalizedScore = (rawValue / maxScore) * 20;
        totalWeighted += normalizedScore * coefficient;
        totalCoefficient += coefficient;

        usedEvaluations.push(`${evaluation.subject} ${rawValue}/${maxScore} coef ${coefficient}`);
      }

      termAverage = totalCoefficient > 0 ? Number((totalWeighted / totalCoefficient).toFixed(2)) : null;
    }

    console.log('[SERVER TERM AVERAGE DEBUG]');
    console.log('[SERVER TERM AVERAGE DEBUG] Student:', studentName);
    console.log('[SERVER TERM AVERAGE DEBUG] Term:', termName);
    console.log('[SERVER TERM AVERAGE DEBUG] USED:');
    usedEvaluations.forEach((line) => console.log('[SERVER TERM AVERAGE DEBUG] ' + line));
    console.log('[SERVER TERM AVERAGE DEBUG] IGNORED:');
    ignoredEvaluations.forEach((line) => console.log('[SERVER TERM AVERAGE DEBUG] ' + line));
    console.log('[SERVER TERM AVERAGE DEBUG] Average:', termAverage != null ? termAverage.toFixed(2) : 'null');
  } catch (e) {
    console.log('[SERVER TERM AVERAGE DEBUG] Failed to compute term average:', String(e));
    termAverage = null;
  }

  return res.json({ grades, termAverage });
});

// 7. GET /api/mobile/parent/notifications
app.get("/api/mobile/parent/notifications", requireAuth, requireParentRoleOnly, async (req: AuthenticatedRequest, res) => {
  const parentId = req.parent!.id;
  const notifications = await store.getInAppNotifications(parentId);
  return res.json(notifications);
});

// 8. PUT /api/mobile/parent/notifications/read-all
app.put("/api/mobile/parent/notifications/read-all", requireAuth, requireParentRoleOnly, async (req: AuthenticatedRequest, res) => {
  const parentId = req.parent!.id;
  await store.markAllInAppNotificationsAsRead(parentId);
  return res.json({ success: true, message: "Toutes les notifications ont été marquées comme lues." });
});

// 8b. PUT /api/mobile/parent/notifications/:id/read
app.put("/api/mobile/parent/notifications/:id/read", requireAuth, requireParentRoleOnly, async (req: AuthenticatedRequest, res) => {
  const parentId = req.parent!.id;
  const { id } = req.params;
  await store.markInAppNotificationAsRead(parentId, id);
  return res.json({ success: true, message: "Notification marquée comme lue." });
});

// 9. POST /api/mobile/parent/devices/register-push-token
app.post("/api/mobile/parent/devices/register-push-token", requireAuth, requireParentRoleOnly, async (req: AuthenticatedRequest, res) => {
   console.log("========== REGISTER PUSH TOKEN ==========");
  console.log("Body reçu :", req.body);
  const parentId = req.parent!.id;
  const validation = RegisterPushTokenSchema.safeParse(req.body);
  
  if (!validation.success) {
    logger.warn(`Échec de validation de l'enregistrement de token pour le parent: ${parentId}`);
    return res.status(400).json({
      error: "Paramètres de notification invalides.",
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

logger.audit(
  "REGISTER_PUSH_TOKEN",
  parentId,
  { platform, appVersion },
  "SUCCESS"
);

return res.json({
  success: true,
  message: "Token de notification enregistré.",
  device
  });
});

// 10a. GET /api/mobile/parent/notification-preferences
app.get("/api/mobile/parent/notification-preferences", requireAuth, requireParentRoleOnly, async (req: AuthenticatedRequest, res) => {
  const parentId = req.parent!.id;
  const preferences = await store.getNotificationPreferences(parentId);
  const consents = await store.getConsentsOfParent(parentId);
  return res.json({
    preferences,
    consents
  });
});

// 10. PUT /api/mobile/parent/notification-preferences
app.put("/api/mobile/parent/notification-preferences", requireAuth, requireParentRoleOnly, async (req: AuthenticatedRequest, res) => {
  const parentId = req.parent!.id;
  const validation = NotificationPreferencesSchema.safeParse(req.body);

  if (!validation.success) {
    logger.warn(`Échec de la validation de préférences pour le parent: ${parentId}`);
    return res.status(400).json({
      error: "Paramètres de préférences invalides.",
      code: "BAD_REQUEST",
      details: validation.error.format()
    });
  }

  const { pushEnabled, whatsappEnabled, smsEnabled, quietHoursStart, quietHoursEnd, whatsappConsent, smsConsent } = validation.data;

  if (whatsappConsent !== undefined) {
    await store.updateConsent(parentId, "whatsapp", whatsappConsent, "v1.0-fr");
  }
  if (smsConsent !== undefined) {
    await store.updateConsent(parentId, "sms", smsConsent, "v1.0-fr");
  }

  const updatedPref = await store.updateNotificationPreferences(parentId, {
    pushEnabled,
    whatsappEnabled,
    smsEnabled,
    quietHoursStart: quietHoursStart ?? undefined,
    quietHoursEnd: quietHoursEnd ?? undefined
  });

  logger.audit("UPDATE_PREFERENCES", parentId, { pushEnabled, whatsappEnabled, smsEnabled }, "SUCCESS");
  return res.json({
    success: true,
    message: "Préférences de notification mises à jour.",
    preferences: updatedPref,
    consents: await store.getConsentsOfParent(parentId)
  });
});

// 11. POST /api/mobile/parent/notifications/test
app.post("/api/mobile/parent/notifications/test", requireAuth, requireParentRoleOnly, async (req: AuthenticatedRequest, res) => {
  const parentId = req.parent!.id;
  const validation = TestNotificationSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: "Veuillez fournir un titre et un corps de message valides.",
      code: "BAD_REQUEST",
      details: validation.error.format()
    });
  }

  const { title, message, target } = validation.data;

  // Generate unique deduplication key for test triggers
  const dedupeKey = `test-${parentId}-${Date.now()}`;
  const result = await NotificationService.dispatchNotification(
    parentId,
    title,
    message,
    'test',
    {
      deepLink: 'ecoletrack://dashboard',
      ...(target ? { target } : {})
    },
    dedupeKey
  );

  logger.audit("TEST_NOTIFICATION_DISPATCH", parentId, { title }, "SUCCESS");
  return res.json({
    success: true,
    message: "Test de notification multi-canal envoyé à la file d'attente.",
    result
  });
});

// 12. GET /api/mobile/health
app.get("/api/mobile/health", (req, res) => {
  const now = new Date().toISOString();
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

// ====================================================================
// DEV / CONTROL PANEL ENDPOINTS (FOR LIVE TESTING EXCLUSIVELY)
// ====================================================================

// Add absence via backend simulator
app.post("/api/dev/add-absence", async (req, res) => {
  const { childId, date, reason, justified, justificationText } = req.body;
  if (!childId || !reason) {
    return res.status(400).json({ error: "childId and reason required" });
  }

  const absence = await store.addAbsence({
    childId,
    date: date || new Date().toISOString(),
    reason,
    justified: !!justified,
    justificationText
  });

  const children = await store.getChildrenOfParent("parent-jean-dupont"); // Default for demonstration
  const backupChildren = await store.getChildrenOfParent("parent-marie-martin");
  const child = children.find(c => c.id === childId) || backupChildren.find(c => c.id === childId);
  
  if (child) {
    const parentId = child.parentId;
    const dedupeKey = `absence-${child.id}-${Date.now()}`;
    const name = `${child.firstName} ${child.lastName}`;
    await NotificationService.dispatchNotification(
      parentId,
      "Alerte Absence ÉcoleTrack",
      `Absence enregistrée pour ${name} le ${new Date(date).toLocaleDateString('fr-FR')}. Motif : ${reason}`,
      'absence',
      { childId, childName: name, date, reason },
      dedupeKey
    );
  }

  return res.json({ success: true, absence });
});

// Add grade via backend simulator
app.post("/api/dev/add-grade", async (req, res) => {
  const { childId, childIds, subject, grade, coefficient, examName, date } = req.body;
  const requestedChildIds = Array.isArray(childIds)
    ? childIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : childId ? [String(childId)] : [];

  if (requestedChildIds.length === 0 || !subject || grade === undefined || !examName) {
    return res.status(400).json({ error: "Missing required grade properties" });
  }

  const gradeObj = await store.addGrade({
    childId: requestedChildIds[0],
    subject,
    grade: parseFloat(grade),
    coefficient: coefficient ? parseFloat(coefficient) : 1,
    examName,
    date: date || new Date().toISOString().split('T')[0]
  } as any);

  const children = await store.getChildrenOfParent("parent-jean-dupont");
  const backupChildren = await store.getChildrenOfParent("parent-marie-martin");
  const primaryChild = children.find(c => c.id === requestedChildIds[0]) || backupChildren.find(c => c.id === requestedChildIds[0]);

  const resolvedParentIds = await store.getParentIdsForChildren(requestedChildIds);
  const notificationParentIds = resolvedParentIds.length > 0 ? resolvedParentIds : primaryChild ? [primaryChild.parentId] : [];

  if (primaryChild) {
    const dedupeKey = `grade-${requestedChildIds[0]}-${Date.now()}`;
    const name = `${primaryChild.firstName} ${primaryChild.lastName}`;

    await NotificationService.dispatchNotification(
      notificationParentIds,
      "Nouvelle note disponible",
      `${name} a reçu un ${grade}/20 en ${subject} (${examName}).`,
      'grade',
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

// Retrieve Delivery logs
app.get("/api/dev/delivery-logs", (req, res) => {
  const logs = store.getCompleteDeliveryLogs();
  return res.json(logs);
});

// Clear all notification delivery history logs
app.post("/api/dev/clear-logs", (req, res) => {
  store.clearAllLogs();
  return res.json({ success: true });
});
// ==========================================
// INTERNAL SERVER-TO-SERVER NOTIFICATION
// Called by web ecoles (pilot phase)
// ==========================================
app.post("/api/internal/absence-notification", async (req: Request, res: Response) => {
  try {
    const {
      parentId,
      title,
      message,
      category = "absence",
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

  } catch (err: any) {
    logger.error("Internal absence notification failed", err);

    return res.status(500).json({
      error: "Notification dispatch failed"
    });
  }
});

app.post("/api/internal/grade-notification", async (req: Request, res: Response) => {
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

    const childIds = Array.isArray(metadata?.childIds)
      ? metadata.childIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    const parentIds = Array.isArray(metadata?.parentIds)
      ? metadata.parentIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];

    const resolvedParentIds = parentIds.length > 0
      ? parentIds
      : childIds.length > 0
        ? await store.getParentIdsForChildren(childIds)
        : [String(parentId)];

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

  } catch (err: any) {
    logger.error("Internal grade notification failed", err);

    return res.status(500).json({
      error: "Notification dispatch failed"
    });
  }
});
app.post("/api/internal/evaluation-notification", async (req: Request, res: Response) => {
  console.log("📢 EVALUATION NOTIFICATION RECUE", req.body);
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

  } catch (err: any) {
    logger.error("Internal evaluation notification failed", err);

    return res.status(500).json({
      error: "Notification dispatch failed"
    });
  }
});

app.post("/api/internal/info-notification", async (req: Request, res: Response) => {
  console.log("📢 INFO NOTIFICATION RECUE", req.body);
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

  } catch (err: any) {
    logger.error("Internal info notification failed", err);

    return res.status(500).json({
      error: "Notification dispatch failed"
    });
  }
});
// ====================================================================
// VITE OR STATIC FILE HOSTING (FULL-STACK CONFIG)
// ====================================================================
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[ÉcoleTrack Server] Running on http://localhost:${PORT}`);
  });
}

startServer();
