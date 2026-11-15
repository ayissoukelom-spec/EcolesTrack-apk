/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response, NextFunction } from "express";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import { promises as fsPromises } from "fs";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import { store } from "./backend/store";
import { MobileVisitRateLimiter, recordAuthenticatedMobileParentVisit } from "./backend/mobileVisit";
import {
  authenticateMobileParentLogin,
  authenticateMobileParentLoginAndRecord,
  MOBILE_PARENT_ACCOUNT_DISABLED_MESSAGE,
  MobileParentAccountDisabledError,
  MobileParentLoginRecordError,
} from "./backend/parentLogin";
import { createMobileRequireAuth } from "./backend/sessionAuthorization";
import { registerChildPhotoRoutes } from "./backend/mobilePhotoRoutes";
import { registerParentWhatsAppRoute } from "./backend/parentWhatsAppRoute";
import { AbsenceJustificationAlreadyRejectedError } from "./backend/absenceJustification";
import { relayLateArrivalJustification } from "./backend/lateArrivalJustificationRelay";
import { withTemporaryUploadCleanup } from "./backend/temporaryUploadCleanup";
import { AbsenceDeclarationRelayError, relayAbsenceDeclaration } from "./backend/absenceDeclarations";
import { dbQuery, initializeMobileTables, verifyMobileTables } from "./backend/postgres";
import { getExpectedPeriodTypeForCycle } from "./src/utils/schoolPeriod";
import { calculateCurrentTermAverage } from "./src/utils/termAverage";
import { helmetHeaders, requestIdMiddleware, sanitizePayload } from "./backend/middlewares/security";
import { Logger } from "./backend/utils/logger";
import {
  AuthService,
  MobileSessionAuthorizationError,
  MobileSessionTemporaryError,
} from "./backend/services/auth";
import { NotificationService } from "./backend/services/notification";
import {
  isInvalidFcmTokenError,
  isPermanentFcmCredentialError,
  sendPushNotification,
} from "./backend/services/fcm";
import {
  isTuitionProgressPushRequest,
  sendTuitionProgressReminderPush,
} from "./backend/services/tuitionProgressPush";
import {
  isConfiguredLocalTuitionReminderTestTarget,
  isLocalTuitionReminderTestEnvironment,
  isLocalTuitionReminderTestDatabaseIdentity,
} from "./backend/services/localTuitionReminderTest";
import { QueueManager } from "./backend/jobs/queue";
import { LoginSchema, RegisterPushTokenSchema, NotificationPreferencesSchema, TestNotificationSchema, ParentAbsenceDeclarationSchema } from "./backend/validators/schemas";
import { getNewPasswordPolicyError } from "./src/utils/passwordPolicy";

const logger = new Logger("ExpressServer");

const isVerifiedLocalTuitionReminderTestDatabase = async (): Promise<boolean> => {
  if (!isLocalTuitionReminderTestEnvironment()) return false;
  try {
    const result = await dbQuery<{
      database_name: string;
      server_address: string | null;
    }>("SELECT current_database() AS database_name, inet_server_addr()::text AS server_address");
    const identity = result.rows[0];
    return Boolean(identity && isLocalTuitionReminderTestDatabaseIdentity({
      databaseName: identity.database_name,
      serverAddress: identity.server_address,
    }));
  } catch {
    logger.error("Local tuition reminder test database identity check failed");
    return false;
  }
};

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
const uploadStorageDir = path.join(process.cwd(), "uploads", "absence-justifications");
const webBackendUrl = () => (process.env.WEB_BACKEND_URL || "").trim().replace(/\/+$/, "");

const MAX_ABSENCE_ATTACHMENT_COUNT = 5;
const allowedJustificationMimeTypes = ["application/pdf", "image/png", "image/jpeg"];

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadStorageDir,
    filename: (_req, file, cb) => {
      const randomSuffix = crypto.randomBytes(16).toString("hex");
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}-${randomSuffix}-${safeName}`);
    }
  }),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: MAX_ABSENCE_ATTACHMENT_COUNT,
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedJustificationMimeTypes.includes(file.mimetype)) {
      return cb(new Error("Unsupported file type"));
    }
    cb(null, true);
  }
});

const handleAbsenceJustificationUpload = (req: Request, res: Response, next: NextFunction) => {
  upload.fields([
    { name: "files", maxCount: MAX_ABSENCE_ATTACHMENT_COUNT },
    { name: "file", maxCount: 1 }
  ])(req, res, async (err: any) => {
    if (err) {
      const partialFiles = collectAbsenceJustificationFiles(req);
      await withTemporaryUploadCleanup(partialFiles, uploadStorageDir, async () => undefined);
      return res.status(400).json({ error: err.message || "Invalid file upload", code: "UPLOAD_INVALID" });
    }

    (req as any).uploadedFiles = collectAbsenceJustificationFiles(req);
    return next();
  });
};

function collectAbsenceJustificationFiles(req: Request): Express.Multer.File[] {
  const files: Express.Multer.File[] = [];
  const requestFiles = (req as any).files;
  if (Array.isArray(requestFiles)) {
    files.push(...requestFiles);
  } else if (requestFiles && typeof requestFiles === "object") {
    for (const fieldFiles of Object.values(requestFiles as Record<string, Express.Multer.File[]>)) {
      files.push(...fieldFiles);
    }
  }
  if ((req as any).file) files.push((req as any).file);
  return Array.from(new Map(files.filter((file) => file?.path).map((file) => [file.path, file])).values());
}

async function forwardAbsenceJustificationToWeb(absenceId: string, parentId: string, justificationReason: string, uploadedFile: Express.Multer.File) {
  const targetBaseUrl = webBackendUrl();
  if (!targetBaseUrl) {
    throw new Error("WEB_BACKEND_URL is not configured");
  }

  const fileBuffer = await fsPromises.readFile(uploadedFile.path);
  const fileSha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");
  const payload = {
    absenceId: String(absenceId),
    parentId: String(parentId),
    justificationReason,
    fileName: uploadedFile.originalname,
    fileMimeType: uploadedFile.mimetype,
    fileSize: String(uploadedFile.size),
    fileSha256,
  };
  const timestamp = Date.now().toString();
  const internalSecret = process.env.INTERNAL_SECRET;
  if (!internalSecret || !internalSecret.trim()) {
    throw new Error("INTERNAL_SECRET is not configured");
  }
  const hmac = crypto.createHmac("sha256", internalSecret);
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
      "X-Internal-Timestamp": timestamp,
    },
    body: formData,
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

function signInternalRequest(payload: object): { signature: string; timestamp: string } {
  const internalSecret = process.env.INTERNAL_SECRET;
  if (!internalSecret || !internalSecret.trim()) {
    throw new Error("INTERNAL_SECRET is not configured");
  }
  const timestamp = Date.now().toString();
  const hmac = crypto.createHmac("sha256", internalSecret);
  hmac.update(`${JSON.stringify(payload)}${timestamp}`);
  return { signature: hmac.digest("hex"), timestamp };
}

async function forwardLateArrivalJustificationToWeb(
  lateArrivalId: string,
  parentId: string,
  justificationReason: string,
  uploadedFiles: Express.Multer.File[],
) {
  const targetBaseUrl = webBackendUrl();
  if (!targetBaseUrl) throw new Error("WEB_BACKEND_URL is not configured");

  const files = await Promise.all(uploadedFiles.map(async (file) => {
    const buffer = await fsPromises.readFile(file.path);
    return {
      file,
      buffer,
      metadata: {
        fileName: file.originalname,
        fileMimeType: file.mimetype,
        fileSize: String(file.size),
        fileSha256: crypto.createHash("sha256").update(buffer).digest("hex"),
      },
    };
  }));
  const payload = {
    lateArrivalId: String(lateArrivalId),
    parentId: String(parentId),
    justificationReason,
    files: files.map(({ metadata }) => metadata),
  };
  const { signature, timestamp } = signInternalRequest(payload);
  const formData = new FormData();
  formData.append("lateArrivalId", payload.lateArrivalId);
  formData.append("parentId", payload.parentId);
  formData.append("justificationReason", payload.justificationReason);
  formData.append("filesMetadata", JSON.stringify(payload.files));
  files.forEach(({ file, buffer }) => {
    formData.append("files", new Blob([buffer], { type: file.mimetype }), file.originalname);
  });

  return fetch(`${targetBaseUrl}/api/internal/late-arrival-justification`, {
    method: "POST",
    headers: {
      "X-Internal-Signature": signature,
      "X-Internal-Timestamp": timestamp,
    },
    body: formData,
  });
}

async function fetchLateArrivalJustificationFileFromWeb(
  lateArrivalId: string,
  parentId: string,
  fileId: string,
) {
  const targetBaseUrl = webBackendUrl();
  if (!targetBaseUrl) throw new Error("WEB_BACKEND_URL is not configured");
  const payload = {
    lateArrivalId: String(lateArrivalId),
    parentId: String(parentId),
    fileId: String(fileId),
  };
  const { signature, timestamp } = signInternalRequest(payload);
  return fetch(`${targetBaseUrl}/api/internal/late-arrival-justification-file`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Signature": signature,
      "X-Internal-Timestamp": timestamp,
    },
    body: JSON.stringify(payload),
  });
}

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
  res.header("Access-Control-Expose-Headers", "Retry-After");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// ====================================================================
// CRYPTO-JWT HELPER
// ====================================================================


async function generateToken(payload: { parentId: string; role: string }): Promise<string> {
  // Use AuthService to keep session management synchronized
  const { accessToken } = await AuthService.createSession(payload.parentId, payload.role);
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
const mobileVisitRateLimiter = new MobileVisitRateLimiter(60, 60000);
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
      const resetInSeconds = Math.max(1, Math.ceil((clientLimit.resetTime - now) / 1000));
      res.setHeader("Retry-After", String(resetInSeconds));
      return res.status(429).json({
        error: "Trop de requêtes. Veuillez patienter avant de réessayer.",
        code: "TOO_MANY_REQUESTS",
        details: { resetInSeconds }
      });
    }
    next();
  };
}

const rateLimitMobileParentVisits = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parentId = req.parent?.id;
  if (!parentId) {
    return res.status(401).json({
      error: "Authentification requise.",
      code: "UNAUTHORIZED"
    });
  }

  const result = mobileVisitRateLimiter.consume(parentId);
  if (!result.allowed) {
    res.setHeader("Retry-After", String(result.resetInSeconds));
    return res.status(429).json({
      error: "Trop de requêtes. Veuillez patienter avant de réessayer.",
      code: "TOO_MANY_REQUESTS",
      details: { resetInSeconds: result.resetInSeconds }
    });
  }
  next();
};

// Authentication check
const requireAuth = createMobileRequireAuth(
  verifyToken,
  (parentId, claims) => AuthService.getAccountAuthorizationState(parentId, claims),
  (error) => logger.error("Impossible de vérifier le statut du compte mobile.", error),
);

// Strict parental check
const requireParentRoleOnly = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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

// Internal server-to-server signature verification
const verifyInternalAuth = (req: Request, res: Response, next: NextFunction) => {
  const signature = req.headers["x-internal-signature"];
  const timestamp = req.headers["x-internal-timestamp"];

  // Collect raw body for signature verification
  let body = "";
  if (typeof req.body === "object") {
    body = JSON.stringify(req.body);
  } else {
    body = String(req.body || "");
  }

  if (typeof signature !== "string" || typeof timestamp !== "string"
    || !AuthService.verifyInternalSignature(body, signature, timestamp)) {
    logger.warn(`[SECURITY VIOLATION] Invalid internal signature or timestamp. IP: ${req.ip}, URL: ${req.originalUrl}`);
    return res.status(401).json({
      error: "Signature interne invalide ou expirée.",
      code: "INVALID_INTERNAL_SIGNATURE"
    });
  }

  logger.info(`[INTERNAL_AUTH] Valid signature verified for ${req.method} ${req.originalUrl}`);
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

  const { email, identifier, phoneCountryCode, password } = validation.data;
  const loginIdentifier = String(identifier ?? email ?? '').trim();
  let user: Awaited<ReturnType<typeof store.findParentByEmail>>;
  try {
    user = await authenticateMobileParentLoginAndRecord(
      loginIdentifier,
      password,
      phoneCountryCode,
      store,
      async (userId) => {
        const result = await dbQuery(
          "UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1",
          [Number(userId)],
        );
        return result.rowCount ?? 0;
      },
    );
  } catch (error) {
    if (error instanceof MobileParentAccountDisabledError) {
      return res.status(403).json({
        error: MOBILE_PARENT_ACCOUNT_DISABLED_MESSAGE,
        code: "ACCOUNT_DISABLED"
      });
    }
    if (!(error instanceof MobileParentLoginRecordError)) throw error;
    logger.error("Impossible d'enregistrer la dernière connexion du parent.", error.originalError);
    return res.status(500).json({
      error: "Impossible d'enregistrer la connexion.",
      code: "LOGIN_RECORD_FAILED"
    });
  }

  if (!user) {
    logger.warn("Échec de connexion parent: identifiant ou mot de passe invalide.");
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

  let session: Awaited<ReturnType<typeof AuthService.createSession>>;
  try {
    session = await AuthService.createSession(user.id, user.role);
  } catch (error) {
    if (error instanceof MobileSessionAuthorizationError) {
      return res.status(401).json({
        error: error.reason === "account_disabled"
          ? MOBILE_PARENT_ACCOUNT_DISABLED_MESSAGE
          : "Ce compte est désactivé ou sa session a été révoquée.",
        code: error.reason === "account_disabled" ? "ACCOUNT_DISABLED" : "INVALID_SESSION"
      });
    }
    logger.error("Impossible de créer une session mobile Parent.", error);
    return res.status(503).json({
      error: error instanceof MobileSessionTemporaryError
        ? "Le service de session est temporairement indisponible. Réessayez."
        : "Impossible de créer la session. Réessayez.",
      code: "SESSION_CREATION_UNAVAILABLE"
    });
  }

  try {
    await dbQuery(`
      INSERT INTO user_login_events (user_id, role, school_id, client_type)
      VALUES ($1, $2, $3, $4)
    `, [Number(user.id), user.role, user.activeSchoolId ? Number(user.activeSchoolId) : null, "android"]);
  } catch {
    logger.warn("Impossible d'enregistrer l'événement de connexion Android; le login continue.");
  }

  const parentDetails = {
    id: user.id,
    name: user.name,
    email: user.email,
    activeSchoolId: user.activeSchoolId,
    schools: user.schools
  };

  logger.audit("PARENT_LOGIN_SUCCESS", user.id, { mustReset: localMustReset }, "SUCCESS");
  return res.json({
    parent: parentDetails,
    token: session.accessToken,
    refreshToken: session.refreshToken,
    mustReset: localMustReset
  });
});

app.post("/api/mobile/parent/visit", requireAuth, requireParentRoleOnly, rateLimitMobileParentVisits, async (req: AuthenticatedRequest, res) => {
  try {
    const outcome = await recordAuthenticatedMobileParentVisit(req.parent, async (parentId) => {
      const result = await dbQuery(`
        WITH target AS MATERIALIZED (
          SELECT id, role, last_mobile_visit_at
          FROM users
          WHERE id = $1
          FOR UPDATE
        ), updated AS (
          UPDATE users AS user_row
          SET last_mobile_visit_at = CURRENT_TIMESTAMP
          FROM target
          WHERE user_row.id = target.id
            AND target.role = 'parent'
            AND (
              target.last_mobile_visit_at IS NULL
              OR target.last_mobile_visit_at <= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
            )
          RETURNING user_row.id
        )
        SELECT CASE
          WHEN EXISTS (SELECT 1 FROM updated) THEN 'recorded'
          WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'parent_not_found'
          WHEN EXISTS (SELECT 1 FROM target WHERE role <> 'parent') THEN 'parent_role_invalid'
          ELSE 'coalesced'
        END AS outcome
      `, [Number(parentId)]);
      return result.rows[0]?.outcome;
    });

    if (outcome === "recorded") return res.json({ success: true, recorded: true });
    if (outcome === "coalesced") {
      return res.json({ success: true, recorded: false, reason: "recent_visit" });
    }
    if (outcome === "parent_not_found") {
      return res.status(404).json({ error: "Parent introuvable.", code: "PARENT_NOT_FOUND" });
    }
    if (outcome === "parent_role_invalid") {
      return res.status(403).json({ error: "Accès réservé aux parents.", code: "PARENTS_ONLY" });
    }
    throw new Error("Unexpected mobile parent visit outcome from database.");
  } catch (error) {
    logger.error("Impossible d'enregistrer la dernière visite mobile.", error);
    return res.status(500).json({
      error: "Impossible d'enregistrer la visite.",
      code: "VISIT_RECORD_FAILED"
    });
  }
});

app.post("/api/mobile/parent/change-password", rateLimit(15, 60000), async (req, res) => {
  const { email, identifier, phoneCountryCode, currentPassword, newPassword } = req.body ?? {};
  const loginIdentifier = String(identifier ?? email ?? '').trim();
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

  const newSalt = crypto.randomBytes(16).toString("hex");
  const newHash = crypto.pbkdf2Sync(newPassword, newSalt, 310000, 64, "sha512").toString("hex");
  await dbQuery(`UPDATE local_auths SET password_hash = $1, salt = $2, must_reset = false WHERE user_id = $3`, [newHash, newSalt, Number(user.id)]);

  logger.audit("PARENT_CHANGE_PASSWORD", user.id, {}, "SUCCESS");
  return res.json({ success: true });
});

// 1b. POST /api/mobile/parent/refresh-token (Refresh Token Rotation - RTR)
app.post("/api/mobile/parent/refresh-token", rateLimit(15, 60000), async (req, res) => {
  const { refreshToken, operationId } = req.body ?? {};
  if (!refreshToken) {
    return res.status(400).json({
      error: "Refresh token manquant.",
      code: "BAD_REQUEST"
    });
  }

  let newSession: Awaited<ReturnType<typeof AuthService.rotateSession>>;
  try {
    newSession = await AuthService.rotateSession(
      typeof refreshToken === "string" ? refreshToken : "",
      typeof operationId === "string" ? operationId : undefined,
    );
  } catch (error) {
    if (error instanceof MobileSessionAuthorizationError && error.reason === "account_disabled") {
      return res.status(401).json({
        error: MOBILE_PARENT_ACCOUNT_DISABLED_MESSAGE,
        code: "ACCOUNT_DISABLED"
      });
    }
    if (error instanceof MobileSessionAuthorizationError) {
      return res.status(401).json({
        error: "Session invalide ou révoquée. Veuillez vous reconnecter.",
        code: "INVALID_SESSION"
      });
    }
    logger.error("Échec de vérification du statut de session mobile.", error);
    return res.status(503).json({
      error: "Vérification de la session indisponible. Réessayez.",
      code: "AUTH_STATUS_UNAVAILABLE"
    });
  }
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

  if (typeof refreshToken !== "string" || !refreshToken.trim()) {
    return res.status(400).json({
      error: "Un jeton de session est requis pour la déconnexion de cet appareil.",
      code: "REFRESH_TOKEN_REQUIRED"
    });
  }

  await AuthService.revokeSession(parentId, refreshToken);

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

registerChildPhotoRoutes(app, requireAuth, requireParentRoleOnly, store);
registerParentWhatsAppRoute(app, requireAuth, requireParentRoleOnly, store, { dbQuery });

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

app.get(
  "/api/mobile/parent/late-arrivals/:lateArrivalId/justification/files/:fileId",
  requireAuth,
  requireParentRoleOnly,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { lateArrivalId, fileId } = req.params;
      if (![lateArrivalId, fileId].every((value) => /^\d+$/.test(value) && Number(value) > 0)) {
        return res.status(400).json({ error: "Identifiant de retard ou de fichier invalide." });
      }

      const response = await fetchLateArrivalJustificationFileFromWeb(
        lateArrivalId,
        req.parent!.id,
        fileId,
      );
      if (!response.ok) {
        const responseBody = await response.text();
        let payload: unknown;
        try {
          payload = JSON.parse(responseBody);
        } catch {
          payload = { error: "Le justificatif n'est pas disponible." };
        }
        return res.status(response.status).json(payload);
      }

      const contentType = response.headers.get("content-type");
      const contentDisposition = response.headers.get("content-disposition");
      if (contentType) res.setHeader("Content-Type", contentType);
      if (contentDisposition) res.setHeader("Content-Disposition", contentDisposition);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).send(Buffer.from(await response.arrayBuffer()));
    } catch (error: any) {
      console.error("Failed to download late-arrival justification file:", error?.name || "Unknown error");
      return res.status(502).json({ error: "Le justificatif n'a pas pu être téléchargé." });
    }
  },
);

const toMobileAbsenceDeclaration = (row: any) => row && ({
  id: String(row.id),
  childId: String(row.studentId),
  date: row.date,
  startTime: row.startTime,
  endTime: row.endTime,
  reason: row.reason ?? undefined,
  status: row.status,
  rejectionReason: row.rejectionReason ?? undefined,
});

app.get("/api/mobile/parent/absence-declarations", requireAuth, requireParentRoleOnly, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await relayAbsenceDeclaration(
      webBackendUrl(),
      process.env.INTERNAL_SECRET || "",
      req.parent!.id,
      "list",
    );
    return res.json(Array.isArray(result.body) ? result.body.map(toMobileAbsenceDeclaration) : []);
  } catch (error: any) {
    const status = error instanceof AbsenceDeclarationRelayError ? error.status : 502;
    return res.status(status).json({ error: error?.message || "Impossible de charger les déclarations." });
  }
});

app.post("/api/mobile/parent/absence-declarations", requireAuth, requireParentRoleOnly, async (req: AuthenticatedRequest, res) => {
  const validation = ParentAbsenceDeclarationSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: "Données de déclaration invalides.", details: validation.error.issues });
  try {
    const input = validation.data;
    const result = await relayAbsenceDeclaration(
      webBackendUrl(),
      process.env.INTERNAL_SECRET || "",
      req.parent!.id,
      "create",
      {
        studentId: Number(input.childId),
        ...(input.schoolId == null ? {} : { schoolId: input.schoolId }),
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        reason: input.reason,
      },
    );
    return res.status(result.status).json(toMobileAbsenceDeclaration(result.body));
  } catch (error: any) {
    const status = error instanceof AbsenceDeclarationRelayError ? error.status : 502;
    return res.status(status).json({ error: error?.message || "Impossible de transmettre la déclaration." });
  }
});

app.put("/api/mobile/parent/absence-declarations/:id", requireAuth, requireParentRoleOnly, async (req: AuthenticatedRequest, res) => {
  const validation = ParentAbsenceDeclarationSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: "Données de déclaration invalides.", details: validation.error.issues });
  try {
    const input = validation.data;
    const result = await relayAbsenceDeclaration(
      webBackendUrl(),
      process.env.INTERNAL_SECRET || "",
      req.parent!.id,
      "update",
      {
        id: req.params.id,
        studentId: Number(input.childId),
        ...(input.schoolId == null ? {} : { schoolId: input.schoolId }),
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        reason: input.reason,
      },
    );
    return res.json(toMobileAbsenceDeclaration(result.body));
  } catch (error: any) {
    const status = error instanceof AbsenceDeclarationRelayError ? error.status : 502;
    return res.status(status).json({ error: error?.message || "Impossible de modifier la déclaration." });
  }
});

app.put("/api/mobile/parent/absence-declarations/:id/cancel", requireAuth, requireParentRoleOnly, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await relayAbsenceDeclaration(
      webBackendUrl(),
      process.env.INTERNAL_SECRET || "",
      req.parent!.id,
      "cancel",
      { id: req.params.id },
    );
    return res.json(toMobileAbsenceDeclaration(result.body));
  } catch (error: any) {
    const status = error instanceof AbsenceDeclarationRelayError ? error.status : 502;
    return res.status(status).json({ error: error?.message || "Impossible d’annuler la déclaration." });
  }
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

    try {
      await NotificationService.dispatchDataInvalidation([{
        parentId,
        entityIds: [String(updatedAbsence.studentId)],
      }], {
        domain: "attendance",
        eventId: `parent-absence-justification-${absenceId}-${crypto.randomUUID()}`,
      });
    } catch (error) {
      logger.error("Parent absence justification invalidation dispatch failed", error);
    }
    return res.json(updatedAbsence);
  } catch (err: any) {
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

app.put("/api/absences/:id/justify", requireAuth, requireParentRoleOnly, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { justificationReason } = req.body;
  const parentId = req.parent!.id;

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
        error: "Absence introuvable ou non rattachée à ce parent.",
        code: "ABSENCE_NOT_FOUND"
      });
    }

    try {
      await NotificationService.dispatchDataInvalidation([{
        parentId,
        entityIds: [String(updatedAbsence.studentId)],
      }], {
        domain: "attendance",
        eventId: `parent-absence-justification-${id}-${crypto.randomUUID()}`,
      });
    } catch (error) {
      logger.error("Parent absence justification invalidation dispatch failed", error);
    }
    return res.json(updatedAbsence);
  } catch (err: any) {
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

app.post("/api/absences/:id/justifications", requireAuth, requireParentRoleOnly, handleAbsenceJustificationUpload, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const parentId = req.parent!.id;
  const justificationReason = typeof req.body?.justificationReason === "string" ? req.body.justificationReason.trim() : "";
  const uploadedFiles = ((req as any).uploadedFiles ?? []) as Express.Multer.File[];

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
          error: `Vous pouvez joindre jusqu'à ${MAX_ABSENCE_ATTACHMENT_COUNT} fichiers maximum.`,
          code: "JUSTIFICATION_FILE_LIMIT_EXCEEDED"
        });
      }

      for (const uploadedFile of uploadedFiles) {
        await forwardAbsenceJustificationToWeb(id, parentId, justificationReason, uploadedFile);
      }

      return res.status(201).json({ success: true });
    });
  } catch (err: any) {
    if (err instanceof AbsenceJustificationAlreadyRejectedError) {
      return res.status(409).json({ error: err.message, code: err.code });
    }
    console.error("Failed to forward absence justification to Web backend:", err?.name || "Unknown error");
    return res.status(500).json({
      error: "Le justificatif n'a pas pu être transmis au serveur Web.",
      code: "INTERNAL_ERROR"
    });
  }
});

app.post(
  "/api/mobile/parent/late-arrivals/:id/justification",
  requireAuth,
  requireParentRoleOnly,
  handleAbsenceJustificationUpload,
  async (req: AuthenticatedRequest, res) => {
    const uploadedFiles = ((req as any).uploadedFiles ?? []) as Express.Multer.File[];
    return withTemporaryUploadCleanup(uploadedFiles, uploadStorageDir, async () => {
      const lateArrivalId = String(req.params.id);
      const parentId = req.parent!.id;
      const justificationReason = typeof req.body?.justificationReason === "string"
        ? req.body.justificationReason.trim()
        : "";
      if (!/^\d+$/.test(lateArrivalId) || Number(lateArrivalId) <= 0) {
        return res.status(400).json({ error: "Identifiant de retard invalide." });
      }
      if (!justificationReason || justificationReason.length > 2000) {
        return res.status(400).json({ error: "Veuillez saisir un motif de justification de 2000 caractères maximum." });
      }
      if (uploadedFiles.length > MAX_ABSENCE_ATTACHMENT_COUNT) {
        return res.status(400).json({
          error: `Vous pouvez joindre jusqu'à ${MAX_ABSENCE_ATTACHMENT_COUNT} fichiers maximum.`,
          code: "JUSTIFICATION_FILE_LIMIT_EXCEEDED"
        });
      }

      const relayResult = await relayLateArrivalJustification(
        () => forwardLateArrivalJustificationToWeb(
          lateArrivalId,
          parentId,
          justificationReason,
          uploadedFiles,
        ),
        (error) => {
          console.error(
            "Failed to forward late-arrival justification to Web backend:",
            error instanceof Error ? error.name : "Unknown error",
          );
        },
      );
      return res.status(relayResult.status).json(relayResult.payload);
    });
  },
);

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
  let cycleCode: string | null = null;
  let activeTerm: { id: number; name: string; period_type: string; start_date: string; end_date: string } | null = null;
  let termEvaluationCount = 0;

  try {
    const childIdNum = Number(childId);
    const studentResult = await dbQuery<{
      first_name: string;
      last_name: string;
      school_id: number | null;
      academic_year_id: number | null;
      cycle_id: number | null;
      cycle_code: string | null;
    }>(
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
    const studentName = studentRow ? `${studentRow.first_name} ${studentRow.last_name}` : 'Unknown';
    cycleCode = studentRow?.cycle_code ?? null;
    const expectedPeriodType = getExpectedPeriodTypeForCycle(cycleCode);

    const termResult = expectedPeriodType && studentRow?.academic_year_id != null && studentRow.cycle_id != null
      ? await dbQuery<{ id: number; name: string; period_type: string; start_date: string; end_date: string }>(
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
        )
      : { rows: [] };

    activeTerm = termResult.rows[0] ?? null;
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
      updatedAt: row.updated_at,
    })), activeTerm ? {
      id: activeTerm.id,
      startDate: activeTerm.start_date,
      endDate: activeTerm.end_date,
    } : null);
    termAverage = averageResult.termAverage;
    termEvaluationCount = averageResult.termEvaluationCount;
    const { usedEvaluations, ignoredEvaluations } = averageResult;

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

  const period = activeTerm && getExpectedPeriodTypeForCycle(cycleCode) === activeTerm.period_type
    ? {
        id: String(activeTerm.id),
        name: activeTerm.name,
        periodType: activeTerm.period_type,
        startDate: activeTerm.start_date,
        endDate: activeTerm.end_date,
      }
    : null;

  return res.json({ grades, cycleCode, period, termAverage, termEvaluationCount });
});

// 7. GET /api/mobile/parent/notifications
app.get("/api/mobile/parent/notifications", requireAuth, requireParentRoleOnly, async (req: AuthenticatedRequest, res) => {
  const parentId = req.parent!.id;
  const notifications = await store.getInAppNotifications(parentId);
  return res.json(notifications);
});

app.get("/api/mobile/parent/notifications/:notificationId/attachments/:attachmentId", requireAuth, requireParentRoleOnly, async (req: AuthenticatedRequest, res) => {
  const notificationId = Number(req.params.notificationId);
  const attachmentId = Number(req.params.attachmentId);
  if (!Number.isInteger(notificationId) || !Number.isInteger(attachmentId)) {
    return res.status(404).json({ error: "Fichier non disponible." });
  }

  const attachmentAccess = await store.getInAppNotificationAttachment(req.parent!.id, notificationId, attachmentId);
  if (!attachmentAccess) {
    return res.status(404).json({ error: "Fichier non disponible." });
  }
  if (!attachmentAccess.authorized) {
    return res.status(403).json({ error: "Vous n'avez pas accès à ce fichier." });
  }

  const targetBaseUrl = webBackendUrl();
  const internalSecret = process.env.INTERNAL_SECRET;
  if (!targetBaseUrl || !internalSecret || !internalSecret.trim()) {
    console.error("Notification attachment relay is not configured");
    return res.status(502).json({ error: "Le serveur de fichiers est indisponible." });
  }

  const timestamp = Date.now().toString();
  const payload = JSON.stringify({ attachmentId: String(attachmentId) });
  const hmac = crypto.createHmac("sha256", internalSecret);
  hmac.update(`${payload}${timestamp}`);
  const signature = hmac.digest("hex");

  let webResponse: globalThis.Response;
  try {
    webResponse = await fetch(`${targetBaseUrl}/api/internal/notification-attachment/${attachmentId}`, {
      method: "GET",
      headers: {
        "X-Internal-Timestamp": timestamp,
        "X-Internal-Signature": signature,
      },
    });
  } catch (error: any) {
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

  const relayStream = Readable.fromWeb(webResponse.body as any);
  relayStream.on("error", (error: any) => {
    console.error("Notification attachment relay stream failed:", error?.message || error);
  });
  return relayStream.pipe(res);
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

const device = await store.registerPushToken(
  parentId,
  deviceId,
  pushToken,
  platform,
  appVersion
);

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

// ==========================================
// INTERNAL SERVER-TO-SERVER NOTIFICATION
// Called by web ecoles (pilot phase)
// ==========================================
app.post("/api/internal/absence-notification", verifyInternalAuth, async (req: Request, res: Response) => {
  try {
    logger.info("[NOTIF_TRACE] /api/internal/absence-notification route entry", { body: req.body });
    const {
      parentId,
      title,
      message,
      category = "absence",
      metadata = {},
      dedupeKey
    } = req.body;

    logger.info("[NOTIF_TRACE] /api/internal/absence-notification parsed body", { parentId, title, message, category, metadata, dedupeKey });

    if (!parentId || !title || !message) {
      return res.status(400).json({
        error: "Missing notification parameters"
      });
    }

    logger.info("[NOTIF_TRACE] /api/internal/absence-notification dispatching", { parentId, title, message, category, metadata, dedupeKey });

    const result = await NotificationService.dispatchNotification(
      String(parentId),
      title,
      message,
      category,
      metadata,
      dedupeKey
    );

    logger.info("[NOTIF_TRACE] /api/internal/absence-notification dispatch result", { result });

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

app.post("/api/internal/tuition-progress-push/test-device-check", verifyInternalAuth, rateLimit(30, 60000), async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown> | null;
  const parentId = typeof body?.parentId === 'string' ? body.parentId : '';
  const schoolId = body?.schoolId;
  const studentId = body?.studentId;
  const academicYearId = body?.academicYearId;
  const cycleId = body?.cycleId;
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId : '';
  const target = {
    schoolId: Number(schoolId),
    studentId: Number(studentId),
    parentUserId: Number(parentId),
    deviceId,
  };
  if (!await isVerifiedLocalTuitionReminderTestDatabase()) {
    return res.status(404).json({ status: "unavailable" });
  }
  if (!/^\d+$/.test(parentId)
    || ![schoolId, studentId, academicYearId, cycleId].every((id) =>
      typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
    || !/^\d{1,32}$/.test(deviceId)
    || !isConfiguredLocalTuitionReminderTestTarget(target)) {
    return res.status(400).json({ status: "invalid_test_target" });
  }
  try {
    const authorized = await store.isAuthorizedTuitionProgressPushRecipient({
      parentId,
      schoolId: Number(schoolId),
      academicYearId: Number(academicYearId),
      cycleId: Number(cycleId),
      studentId: Number(studentId),
    });
    if (!authorized || !await store.isPushChannelEnabled(parentId)) {
      return res.status(409).json({ status: "test_recipient_unavailable" });
    }
    const device = (await store.getDevicesOfParent(parentId))
      .find((candidate) => candidate.id === deviceId && Boolean(candidate.pushToken?.trim()));
    if (!device) return res.status(409).json({ status: "test_device_not_associated" });
    return res.json({
      status: "ready",
      device: {
        id: device.id,
        platform: device.platform,
        appVersion: device.appVersion,
        lastSeenAt: device.lastSeenAt,
      },
    });
  } catch (error) {
    logger.error("Local tuition reminder test-device check failed", error);
    return res.status(503).json({ status: "retryable_failure" });
  }
});

app.post("/api/internal/tuition-progress-push", verifyInternalAuth, rateLimit(60, 60000), async (req: Request, res: Response) => {
  if (!isTuitionProgressPushRequest(req.body)) {
    return res.status(400).json({ status: "permanent_failure", error: "invalid_push_request" });
  }
  if (req.body.testDeviceId || req.body.simulationNow) {
    const target = {
      schoolId: req.body.schoolId,
      studentId: req.body.studentId,
      parentUserId: Number(req.body.parentId),
      deviceId: req.body.testDeviceId ?? "",
    };
    if (!await isVerifiedLocalTuitionReminderTestDatabase()
      || !isConfiguredLocalTuitionReminderTestTarget(target)) {
      return res.status(404).json({ status: "permanent_failure", error: "local_test_unavailable" });
    }
  }
  try {
    const result = await sendTuitionProgressReminderPush(req.body, {
      store,
      send: (token, title, body, target, metadata) => sendPushNotification(
        token,
        title,
        body,
        target,
        { ...metadata, suppressContentLogs: true },
      ),
      classifyFcmError: (error) => {
        if (isInvalidFcmTokenError(error)) return "invalid_token";
        if (isPermanentFcmCredentialError(error)) return "permanent";
        const code = error && typeof error === "object"
          ? String((error as { code?: unknown; errorInfo?: { code?: unknown } }).code
            ?? (error as { errorInfo?: { code?: unknown } }).errorInfo?.code
            ?? "").toLowerCase()
          : "";
        if ([
          "messaging/server-unavailable",
          "messaging/internal-error",
          "messaging/quota-exceeded",
        ].includes(code)) return "retryable";
        return "unknown";
      },
    });
    return res.json(result);
  } catch (error) {
    logger.error("Tuition progress push submission failed", error, {
      controlId: req.body.controlId,
    });
    return res.status(500).json({ status: "uncertain", error: "push_submission_failed" });
  }
});

app.post("/api/internal/grade-notification", verifyInternalAuth, async (req: Request, res: Response) => {
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

    const invalidationEventId = typeof dedupeKey === "string"
      && /^grade-\d+-event-\d+$/.test(dedupeKey)
      ? dedupeKey
      : null;
    const invalidationChildIds = Array.from(new Set([
      ...childIds,
      ...(typeof metadata?.studentId === "string" || typeof metadata?.studentId === "number"
        ? [String(metadata.studentId)]
        : []),
    ]));
    const deliveryMetadata = {
      ...metadata,
      childIds,
      parentIds: resolvedParentIds,
      ...(invalidationEventId ? {
        dataInvalidation: {
          domain: "grades",
          eventId: invalidationEventId,
          entityIds: invalidationChildIds,
          ...(metadata?.eventVersion != null
            ? { revision: String(metadata.eventVersion) }
            : {}),
        },
      } : {}),
    };

    const result = await NotificationService.dispatchNotification(
      resolvedParentIds,
      title,
      message,
      category,
      deliveryMetadata,
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

app.post("/api/internal/data-invalidation", verifyInternalAuth, rateLimit(60, 60000), async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown> | null;
  const recipients = Array.isArray(body?.recipients)
    ? body.recipients.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const recipient = value as Record<string, unknown>;
      if (typeof recipient.parentId !== "string" || !/^\d+$/.test(recipient.parentId)) return [];
      const uniqueEntityIds = Array.isArray(recipient.entityIds)
        ? Array.from(new Set(recipient.entityIds.filter(
          (entityId): entityId is string => typeof entityId === "string" && /^\d+$/.test(entityId),
        )))
        : [];
      const entityIds = uniqueEntityIds.length <= 100 ? uniqueEntityIds : [];
      return [{
        parentId: recipient.parentId,
        ...(entityIds.length ? { entityIds } : {}),
      }];
    })
    : [];
  const eventId = typeof body?.eventId === "string" ? body.eventId : "";
  const supportedDomains = new Set([
    "grades",
    "attendance",
    "absence-declarations",
    "finance",
    "academics",
    "bulletins",
    "notifications",
  ]);
  if (typeof body?.domain !== "string"
    || !supportedDomains.has(body.domain)
    || !/^[A-Za-z0-9:_-]{1,200}$/.test(eventId)
    || recipients.length === 0) {
    return res.status(400).json({ error: "Invalid data invalidation request" });
  }

  try {
    const result = await NotificationService.dispatchDataInvalidation(recipients, {
      domain: body.domain,
      eventId,
    });
    return res.json({ success: true, result });
  } catch (error) {
    logger.error("Internal data invalidation dispatch failed", error);
    return res.status(500).json({ error: "Data invalidation dispatch failed" });
  }
});
app.post("/api/internal/evaluation-notification", verifyInternalAuth, async (req: Request, res: Response) => {
  try {
    const {
      parentId,
      title,
      message,
      metadata = {},
      dedupeKey
    } = req.body;
    const requestedCategory: unknown = req.body?.category;

    if (!parentId || !title || !message) {
      return res.status(400).json({
        error: "Missing notification parameters"
      });
    }
    if (requestedCategory !== undefined && requestedCategory !== "evaluation") {
      return res.status(400).json({
        error: "Invalid notification category",
        code: "INVALID_NOTIFICATION_CATEGORY"
      });
    }

    const result = await NotificationService.dispatchNotification(
      String(parentId),
      title,
      message,
      "evaluation",
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

app.post("/api/internal/info-notification", verifyInternalAuth, async (req: Request, res: Response) => {
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
  await fsPromises.mkdir(uploadStorageDir, { recursive: true });
  if (process.env.ECOLETRACK_RESTRICTED_DB_RUNTIME === "true") {
    await verifyMobileTables();
    console.info("Restricted mobile API database schema verified in read-only mode.");
  } else {
    await initializeMobileTables();
  }

  const purgeExpiredRotationRecoveryData = () => {
    void AuthService.purgeExpiredRotationRecoveryData().catch((error) => {
      logger.error("Impossible de supprimer les données expirées de récupération de session.", error);
    });
  };
  purgeExpiredRotationRecoveryData();
  const recoveryCleanupTimer = setInterval(purgeExpiredRotationRecoveryData, 15 * 60 * 1000);
  recoveryCleanupTimer.unref();

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
