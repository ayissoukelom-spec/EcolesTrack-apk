import crypto from "crypto";
import type { PoolClient } from "pg";
import { Logger } from "../utils/logger";
import { dbQuery, pool } from "../postgres";
import {
  getMobileAccountRejectionReason,
  getMobileSessionRejection,
  type MobileAccountAuthorizationState,
  type MobileSessionClaims,
} from "../sessionAuthorization";

const logger = new Logger("AuthService");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || !JWT_SECRET.trim()) {
  throw new Error("JWT_SECRET environment variable is required");
}

const ACCESS_TOKEN_EXPIRY_MS = 15 * 60 * 1000;
const ABSOLUTE_SESSION_EXPIRY_MS = 60 * 24 * 60 * 60 * 1000;
const IDEMPOTENCY_RECOVERY_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface TokenPayload extends MobileSessionClaims {
  parentId: string;
  role: string;
  exp: number;
  authRevocationEventId?: number;
  sessionId?: number;
  sessionFamilyId?: string;
  refreshGeneration?: number;
  absoluteExpiresAt?: number;
  entropy?: string;
}

export class MobileSessionAuthorizationError extends Error {
  constructor(public readonly reason: "account_disabled" | "session_revoked" | "invalid_session") {
    super("Mobile parent session is no longer authorized.");
    this.name = "MobileSessionAuthorizationError";
  }
}

export class MobileSessionTemporaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MobileSessionTemporaryError";
  }
}

interface AccountRow {
  id: number;
  role: string;
  is_deleted: boolean;
  latest_revocation_event_id: number | string;
  database_now: Date | string;
}

interface SessionRow {
  id: number;
  parent_id: string;
  role: string;
  refresh_token_hash: string;
  is_active: boolean;
  expires_at: Date | string;
  revoked_at: Date | string | null;
  session_family_id: string | null;
  session_started_at: Date | string | null;
  absolute_expires_at: Date | string | null;
  refresh_generation: string | number | null;
  family_revoked_at: Date | string | null;
  rotation_request_id: string | null;
  rotated_to_session_id: number | null;
  rotation_successor_ciphertext: Buffer | null;
  rotation_recovery_expires_at: Date | string | null;
}

interface RecoveryKeyring {
  activeKeyId: string;
  keys: Map<string, Buffer>;
}

type SessionTokens = { accessToken: string; refreshToken: string };
type RotationResult =
  | { kind: "rotated"; tokens: SessionTokens }
  | { kind: "recovered"; tokens: SessionTokens }
  | { kind: "invalid" }
  | { kind: "disabled" };

function hashRefreshToken(refreshToken: string): string {
  return crypto.createHash("sha256").update(refreshToken).digest("hex");
}

function timestampMs(value: Date | string | null): number | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseGeneration(value: string | number | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function getRecoveryKeyring(): RecoveryKeyring {
  const rawKeys = process.env.MOBILE_REFRESH_RECOVERY_KEYS;
  const activeKeyId = process.env.MOBILE_REFRESH_RECOVERY_ACTIVE_KEY_ID?.trim();
  if (!rawKeys || !activeKeyId) {
    throw new MobileSessionTemporaryError("Refresh recovery encryption is unavailable.");
  }

  let encodedKeys: Record<string, unknown>;
  try {
    encodedKeys = JSON.parse(rawKeys) as Record<string, unknown>;
  } catch {
    throw new MobileSessionTemporaryError("Refresh recovery encryption is unavailable.");
  }

  const keys = new Map<string, Buffer>();
  for (const [keyId, encodedKey] of Object.entries(encodedKeys)) {
    if (typeof encodedKey !== "string") {
      throw new MobileSessionTemporaryError("Refresh recovery encryption is unavailable.");
    }
    const key = Buffer.from(encodedKey, "base64");
    if (key.length !== 32) {
      throw new MobileSessionTemporaryError("Refresh recovery encryption is unavailable.");
    }
    keys.set(keyId, key);
  }

  if (!keys.has(activeKeyId)) {
    throw new MobileSessionTemporaryError("Refresh recovery encryption is unavailable.");
  }
  return { activeKeyId, keys };
}

function encryptRefreshToken(refreshToken: string): Buffer {
  const keyring = getRecoveryKeyring();
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyring.keys.get(keyring.activeKeyId)!, nonce);
  const ciphertext = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  const envelope = {
    version: 1,
    keyId: keyring.activeKeyId,
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  return Buffer.from(JSON.stringify(envelope), "utf8");
}

function decryptRefreshToken(envelopeBytes: Buffer): string {
  const keyring = getRecoveryKeyring();
  let envelope: {
    version?: unknown;
    keyId?: unknown;
    nonce?: unknown;
    tag?: unknown;
    ciphertext?: unknown;
  };
  try {
    envelope = JSON.parse(envelopeBytes.toString("utf8"));
  } catch {
    throw new MobileSessionTemporaryError("Refresh recovery data is unavailable.");
  }

  if (
    envelope.version !== 1
    || typeof envelope.keyId !== "string"
    || typeof envelope.nonce !== "string"
    || typeof envelope.tag !== "string"
    || typeof envelope.ciphertext !== "string"
  ) {
    throw new MobileSessionTemporaryError("Refresh recovery data is unavailable.");
  }

  const key = keyring.keys.get(envelope.keyId);
  if (!key) throw new MobileSessionTemporaryError("Refresh recovery key is unavailable.");

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.nonce, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new MobileSessionTemporaryError("Refresh recovery data could not be decrypted.");
  }
}

export class AuthService {
  private static async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        logger.error("Unable to roll back mobile session transaction.", rollbackError);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private static async lockAccount(client: PoolClient, parentId: string): Promise<AccountRow | null> {
    const parsedParentId = Number(parentId);
    if (!Number.isSafeInteger(parsedParentId) || parsedParentId <= 0) return null;

    const { rows } = await client.query<Pick<AccountRow, "id" | "role" | "is_deleted">>(`
      SELECT u.id, u.role, u.is_deleted
      FROM users u
      WHERE u.id = $1
      FOR UPDATE OF u
    `, [parsedParentId]);
    const user = rows[0];
    if (!user) return null;

    const status = await client.query<Pick<AccountRow, "latest_revocation_event_id" | "database_now">>(`
      SELECT COALESCE(MAX(event.id), 0) AS latest_revocation_event_id,
             clock_timestamp() AS database_now
      FROM audit_events event
      WHERE event.resource_type = 'user'
        AND event.resource_id = $1
        AND event.action IN ('delete', 'session_revoked')
    `, [user.id]);
    return { ...user, ...status.rows[0] };
  }

  public static async getAccountAuthorizationState(
    parentId: string,
    claims?: MobileSessionClaims,
  ): Promise<MobileAccountAuthorizationState | null> {
    const parsedParentId = Number(parentId);
    if (!Number.isSafeInteger(parsedParentId) || parsedParentId <= 0) return null;
    const sessionId = claims?.sessionId;
    const hasSessionId = Number.isSafeInteger(sessionId) && Number(sessionId) > 0;

    const { rows } = await dbQuery<{
      role: string;
      is_deleted: boolean;
      latest_revocation_event_id: number | string;
      session_id: number | null;
      session_parent_id: string | null;
      session_role: string | null;
      session_active: boolean | null;
      session_revoked_at: Date | string | null;
      session_expires_at: Date | string | null;
      session_family_id: string | null;
      session_generation: string | number | null;
      session_absolute_expires_at: Date | string | null;
      session_family_revoked_at: Date | string | null;
    }>(`
      SELECT u.role,
             u.is_deleted,
             COALESCE((
               SELECT MAX(event.id)
               FROM audit_events event
               WHERE event.resource_type = 'user'
                 AND event.resource_id = u.id
                 AND event.action IN ('delete', 'session_revoked')
             ), 0) AS latest_revocation_event_id,
             session.id AS session_id,
             session.parent_id AS session_parent_id,
             session.role AS session_role,
             session.is_active AS session_active,
             session.revoked_at AS session_revoked_at,
             session.expires_at AS session_expires_at,
             session.session_family_id,
             session.refresh_generation AS session_generation,
             session.absolute_expires_at AS session_absolute_expires_at,
             session.family_revoked_at AS session_family_revoked_at
      FROM users u
      LEFT JOIN mobile_parent_sessions session
        ON session.id = $2::integer
       AND session.parent_id = u.id::text
      WHERE u.id = $1
    `, [parsedParentId, hasSessionId ? Number(sessionId) : null]);

    const account = rows[0];
    if (!account) return null;
    const latestRevocationEventId = Number(account.latest_revocation_event_id);
    if (!Number.isSafeInteger(latestRevocationEventId) || latestRevocationEventId < 0) {
      throw new Error("Invalid mobile session revocation boundary returned by the database.");
    }

    return {
      role: account.role,
      isDeleted: account.is_deleted,
      latestRevocationEventId,
      session: hasSessionId
        ? account.session_id == null
          ? null
          : {
              id: account.session_id,
              parentId: account.session_parent_id,
              role: account.session_role,
              isActive: account.session_active,
              revokedAt: account.session_revoked_at,
              expiresAt: account.session_expires_at,
              familyId: account.session_family_id,
              generation: parseGeneration(account.session_generation),
              absoluteExpiresAt: account.session_absolute_expires_at,
              familyRevokedAt: account.session_family_revoked_at,
            }
        : undefined,
    };
  }

  private static generateJWT(payload: Record<string, unknown>, expiresAt: number): string {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const data = Buffer.from(JSON.stringify({ ...payload, exp: expiresAt })).toString("base64url");
    const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${data}`).digest("base64url");
    return `${header}.${data}.${signature}`;
  }

  public static verifyJWT(token: string, secret: string = JWT_SECRET): TokenPayload | null {
    try {
      const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
      if (!encodedHeader || !encodedPayload || !encodedSignature) return null;

      const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
      if (header?.alg !== "HS256" || header?.typ !== "JWT") return null;

      const expectedSignature = crypto.createHmac("sha256", secret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest();
      const suppliedSignature = Buffer.from(encodedSignature, "base64url");
      if (
        suppliedSignature.length !== expectedSignature.length
        || !crypto.timingSafeEqual(suppliedSignature, expectedSignature)
      ) {
        return null;
      }

      const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as TokenPayload;
      if (
        typeof payload.parentId !== "string"
        || typeof payload.role !== "string"
        || !Number.isSafeInteger(payload.exp)
        || Number(payload.exp) <= Date.now()
      ) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  private static async issueSession(
    client: PoolClient,
    input: {
      parentId: string;
      role: string;
      authRevocationEventId: number;
      databaseNow: number;
      refreshExpiresAt: number;
      familyId?: string;
      sessionStartedAt?: Date;
      absoluteExpiresAt?: Date;
      generation?: number;
    },
  ): Promise<SessionTokens & { sessionId: number }> {
    const placeholderToken = crypto.randomBytes(32).toString("base64url");
    const placeholderHash = hashRefreshToken(placeholderToken);
    const { rows } = await client.query<{ id: number }>(`
      INSERT INTO mobile_parent_sessions (
        parent_id, role, refresh_token_hash, expires_at, is_active,
        session_family_id, session_started_at, absolute_expires_at, refresh_generation
      )
      VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), true, $5, $6, $7, $8)
      RETURNING id
    `, [
      input.parentId,
      input.role,
      placeholderHash,
      input.refreshExpiresAt,
      input.familyId ?? null,
      input.sessionStartedAt ?? null,
      input.absoluteExpiresAt ?? null,
      input.generation ?? null,
    ]);

    const sessionId = rows[0]?.id;
    if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
      throw new Error("Failed to allocate a mobile parent session identifier.");
    }

    const commonClaims: Record<string, unknown> = {
      parentId: input.parentId,
      role: input.role,
      authRevocationEventId: input.authRevocationEventId,
    };
    const accessClaims: Record<string, unknown> = {
      ...commonClaims,
      sessionId,
      ...(input.familyId ? {
        sessionFamilyId: input.familyId,
        refreshGeneration: input.generation,
        absoluteExpiresAt: input.absoluteExpiresAt!.getTime(),
      } : {}),
    };
    const refreshClaims: Record<string, unknown> = {
      ...commonClaims,
      entropy: crypto.randomBytes(16).toString("hex"),
      ...(input.familyId ? {
        sessionId,
        sessionFamilyId: input.familyId,
        refreshGeneration: input.generation,
        absoluteExpiresAt: input.absoluteExpiresAt!.getTime(),
      } : {}),
    };
    const accessExpiresAt = Math.min(
      input.databaseNow + ACCESS_TOKEN_EXPIRY_MS,
      input.refreshExpiresAt,
      input.absoluteExpiresAt?.getTime() ?? Number.POSITIVE_INFINITY,
    );
    const accessToken = this.generateJWT(accessClaims, accessExpiresAt);
    const refreshToken = this.generateJWT(refreshClaims, input.refreshExpiresAt);
    const newHash = hashRefreshToken(refreshToken);

    const updated = await client.query(`
      UPDATE mobile_parent_sessions
      SET refresh_token_hash = $1
      WHERE id = $2 AND refresh_token_hash = $3
    `, [newHash, sessionId, placeholderHash]);
    if (updated.rowCount !== 1) {
      throw new Error("Failed to persist the mobile parent refresh token hash.");
    }

    return { accessToken, refreshToken, sessionId };
  }

  public static async createSession(parentId: string, role: string): Promise<SessionTokens> {
    return this.withTransaction(async (client) => {
      const account = await this.lockAccount(client, parentId);
      if (!account) throw new MobileSessionAuthorizationError("invalid_session");

      const authRevocationEventId = Number(account.latest_revocation_event_id);
      const rejection = getMobileSessionRejection({
        parentId,
        role,
        authRevocationEventId,
      }, {
        role: account.role,
        isDeleted: account.is_deleted,
        latestRevocationEventId: authRevocationEventId,
      });
      if (rejection) throw new MobileSessionAuthorizationError(rejection);

      const now = timestampMs(account.database_now);
      if (now == null) throw new Error("Database returned an invalid session start time.");
      const familyId = crypto.randomUUID();
      const sessionStartedAt = new Date(now);
      const absoluteExpiresAt = new Date(now + ABSOLUTE_SESSION_EXPIRY_MS);
      const issued = await this.issueSession(client, {
        parentId,
        role,
        authRevocationEventId,
        databaseNow: now,
        refreshExpiresAt: absoluteExpiresAt.getTime(),
        familyId,
        sessionStartedAt,
        absoluteExpiresAt,
        generation: 0,
      });

      return { accessToken: issued.accessToken, refreshToken: issued.refreshToken };
    });
  }

  private static async revokeParentRows(client: PoolClient, parentId: string, now: Date): Promise<void> {
    await client.query(`
      UPDATE mobile_parent_sessions
      SET is_active = false,
          revoked_at = COALESCE(revoked_at, $2),
          family_revoked_at = COALESCE(family_revoked_at, $2),
          rotation_request_id = NULL,
          rotation_successor_ciphertext = NULL,
          rotation_recovery_expires_at = NULL
      WHERE parent_id = $1
    `, [parentId, now]);
  }

  public static async purgeExpiredRotationRecoveryData(): Promise<void> {
    await dbQuery(`
      UPDATE mobile_parent_sessions
      SET rotation_request_id = NULL,
          rotation_successor_ciphertext = NULL,
          rotation_recovery_expires_at = NULL
      WHERE rotation_successor_ciphertext IS NOT NULL
        AND (
          family_revoked_at IS NOT NULL
          OR rotation_recovery_expires_at IS NULL
          OR rotation_recovery_expires_at <= clock_timestamp()
        )
    `);
  }

  private static async recoverRotation(
    client: PoolClient,
    source: SessionRow,
    operationId: string,
    now: number,
    authRevocationEventId: number,
  ): Promise<SessionTokens | null> {
    const recoveryExpiry = timestampMs(source.rotation_recovery_expires_at);
    const rotationTime = timestampMs(source.revoked_at);
    const sourceAbsoluteExpiry = timestampMs(source.absolute_expires_at);
    if (
      source.rotation_request_id !== operationId
      || source.rotated_to_session_id == null
      || !source.rotation_successor_ciphertext
      || recoveryExpiry == null
      || recoveryExpiry <= now
      || rotationTime == null
      || recoveryExpiry > rotationTime + IDEMPOTENCY_RECOVERY_MS
      || (sourceAbsoluteExpiry != null && recoveryExpiry > sourceAbsoluteExpiry)
      || source.family_revoked_at != null
    ) {
      return null;
    }

    const { rows } = await client.query<SessionRow>(`
      SELECT *
      FROM mobile_parent_sessions
      WHERE id = $1 AND parent_id = $2
      FOR UPDATE
    `, [source.rotated_to_session_id, source.parent_id]);
    const successor = rows[0];
    const successorExpiry = timestampMs(successor?.expires_at ?? null);
    const absoluteExpiry = timestampMs(successor?.absolute_expires_at ?? null);
    const sourceGeneration = parseGeneration(source.refresh_generation);
    const successorGeneration = parseGeneration(successor?.refresh_generation ?? null);
    if (
      !successor
      || successor.id === source.id
      || successor.parent_id !== source.parent_id
      || successor.role !== source.role
      || !successor.is_active
      || successor.revoked_at != null
      || successor.family_revoked_at != null
      || successorExpiry == null
      || successorExpiry <= now
      || recoveryExpiry > successorExpiry
      || (absoluteExpiry != null && absoluteExpiry <= now)
      || (absoluteExpiry != null && recoveryExpiry > absoluteExpiry)
      || successor.session_family_id !== source.session_family_id
      || (
        source.session_family_id != null
        && (
          sourceGeneration == null
          || successorGeneration !== sourceGeneration + 1
        )
      )
    ) {
      return null;
    }

    const refreshToken = decryptRefreshToken(source.rotation_successor_ciphertext);
    const refreshPayload = this.verifyJWT(refreshToken);
    if (
      !refreshPayload
      || hashRefreshToken(refreshToken) !== successor.refresh_token_hash
      || refreshPayload.parentId !== successor.parent_id
      || refreshPayload.role !== successor.role
      || refreshPayload.exp > successorExpiry
      || (
        successor.session_family_id != null
        && (
          refreshPayload.sessionId !== successor.id
          || refreshPayload.sessionFamilyId !== successor.session_family_id
          || refreshPayload.refreshGeneration !== parseGeneration(successor.refresh_generation)
        )
      )
    ) {
      throw new MobileSessionTemporaryError("Refresh recovery data did not match its successor.");
    }

    const sessionId = successor.id;
    const accessClaims: Record<string, unknown> = {
      parentId: successor.parent_id,
      role: successor.role,
      authRevocationEventId,
      sessionId,
      ...(successor.session_family_id ? {
        sessionFamilyId: successor.session_family_id,
        refreshGeneration: parseGeneration(successor.refresh_generation),
        absoluteExpiresAt: absoluteExpiry,
      } : {}),
    };
    const accessToken = this.generateJWT(accessClaims, Math.min(
      now + ACCESS_TOKEN_EXPIRY_MS,
      successorExpiry,
      absoluteExpiry ?? Number.POSITIVE_INFINITY,
    ));
    await client.query(
      "UPDATE mobile_parent_sessions SET last_used_at = to_timestamp($1 / 1000.0) WHERE id = $2",
      [now, successor.id],
    );
    return { accessToken, refreshToken };
  }

  public static async rotateSession(
    oldRefreshToken: string,
    operationId?: string,
  ): Promise<SessionTokens | null> {
    if (operationId !== undefined && !UUID_PATTERN.test(operationId)) {
      throw new MobileSessionAuthorizationError("invalid_session");
    }
    const payload = this.verifyJWT(oldRefreshToken);
    if (!payload || payload.role !== "parent") return null;

    const refreshTokenHash = hashRefreshToken(oldRefreshToken);
    const outcome = await this.withTransaction<RotationResult>(async (client) => {
      const account = await this.lockAccount(client, payload.parentId);
      if (!account) return { kind: "invalid" };
      const now = timestampMs(account.database_now);
      if (now == null) throw new Error("Database returned an invalid session time.");
      const latestRevocationEventId = Number(account.latest_revocation_event_id);
      if (!Number.isSafeInteger(latestRevocationEventId) || latestRevocationEventId < 0) {
        throw new Error("Database returned an invalid mobile session revocation boundary.");
      }

      if (account.is_deleted) {
        await this.revokeParentRows(client, payload.parentId, new Date(now));
        return { kind: "disabled" };
      }

      const accountRejection = getMobileAccountRejectionReason(payload, {
        role: account.role,
        isDeleted: account.is_deleted,
        latestRevocationEventId,
      });
      if (accountRejection) {
        logger.warn("Mobile refresh rotation rejected by account revocation boundaries.", {
          reason: accountRejection,
          parentId: payload.parentId,
          sessionId: payload.sessionId ?? null,
          authRevocationEventId: payload.authRevocationEventId ?? null,
        });
        return { kind: "invalid" };
      }

      await client.query(`
        UPDATE mobile_parent_sessions
        SET rotation_successor_ciphertext = NULL,
            rotation_request_id = NULL,
            rotation_recovery_expires_at = NULL
        WHERE parent_id = $1
          AND (
            rotation_recovery_expires_at <= to_timestamp($2 / 1000.0)
            OR revoked_at <= to_timestamp(($2 - $3) / 1000.0)
          )
          AND rotation_successor_ciphertext IS NOT NULL
      `, [payload.parentId, now, IDEMPOTENCY_RECOVERY_MS]);

      let { rows } = await client.query<SessionRow>(`
        SELECT *
        FROM mobile_parent_sessions
        WHERE refresh_token_hash = $1 AND parent_id = $2
        FOR UPDATE
      `, [refreshTokenHash, payload.parentId]);
      let session = rows[0];
      const isLegacyToken = payload.sessionId == null;

      if (!session && isLegacyToken) {
        const tokenExpiry = Number(payload.exp);
        if (!Number.isSafeInteger(tokenExpiry) || tokenExpiry <= now) return { kind: "invalid" };
        const inserted = await client.query<SessionRow>(`
          INSERT INTO mobile_parent_sessions (
            parent_id, role, refresh_token_hash, expires_at, is_active
          )
          VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), true)
          RETURNING *
        `, [payload.parentId, payload.role, refreshTokenHash, tokenExpiry]);
        session = inserted.rows[0];
      }
      if (!session) return { kind: "invalid" };
      if (session.parent_id !== payload.parentId || session.role !== payload.role) {
        return { kind: "invalid" };
      }

      if (!session.is_active) {
        if (operationId) {
          const recovered = await this.recoverRotation(
            client,
            session,
            operationId,
            now,
            latestRevocationEventId,
          );
          if (recovered) return { kind: "recovered", tokens: recovered };
        }
        return { kind: "invalid" };
      }

      const sessionState: MobileAccountAuthorizationState["session"] = {
        id: session.id,
        parentId: session.parent_id,
        role: session.role,
        isActive: session.is_active,
        revokedAt: session.revoked_at,
        expiresAt: session.expires_at,
        familyId: session.session_family_id,
        generation: parseGeneration(session.refresh_generation),
        absoluteExpiresAt: session.absolute_expires_at,
        familyRevokedAt: session.family_revoked_at,
      };
      const rejection = getMobileSessionRejection(payload, {
        role: account.role,
        isDeleted: account.is_deleted,
        latestRevocationEventId,
        session: sessionState,
      });
      if (rejection) {
        logger.warn("Mobile refresh rotation rejected after session validation.", {
          reason: rejection,
          parentId: payload.parentId,
          sessionId: payload.sessionId ?? session.id,
          authRevocationEventId: payload.authRevocationEventId ?? null,
        });
        return { kind: "invalid" };
      }

      const sessionExpiry = timestampMs(session.expires_at);
      const absoluteExpiry = timestampMs(session.absolute_expires_at);
      const generation = parseGeneration(session.refresh_generation);
      const sessionStartedAt = timestampMs(session.session_started_at);
      if (
        session.parent_id !== payload.parentId
        || session.role !== payload.role
        || session.revoked_at != null
        || session.family_revoked_at != null
        || sessionExpiry == null
        || sessionExpiry <= now
        || (absoluteExpiry != null && absoluteExpiry <= now)
        || session.rotated_to_session_id != null
        || session.rotation_request_id != null
        || session.rotation_successor_ciphertext != null
        || session.rotation_recovery_expires_at != null
        || (
          session.session_family_id != null
          && (
            sessionStartedAt == null
            || absoluteExpiry !== sessionStartedAt + ABSOLUTE_SESSION_EXPIRY_MS
            || generation == null
          )
        )
        || (payload.sessionId != null && payload.sessionId !== session.id)
        || (payload.sessionId != null && (
          !session.session_family_id
          || payload.sessionFamilyId !== session.session_family_id
          || generation == null
          || payload.refreshGeneration !== generation
          || payload.absoluteExpiresAt !== absoluteExpiry
        ))
        || (payload.sessionId == null && session.session_family_id != null)
      ) {
        return { kind: "invalid" };
      }

      const legacyExpiry = Math.min(Number(payload.exp), sessionExpiry);
      const refreshExpiresAt = absoluteExpiry ?? legacyExpiry;
      if (!Number.isSafeInteger(refreshExpiresAt) || refreshExpiresAt <= now) {
        return { kind: "invalid" };
      }

      await client.query(`
        UPDATE mobile_parent_sessions
        SET rotation_successor_ciphertext = NULL,
            rotation_request_id = NULL,
            rotation_recovery_expires_at = NULL
        WHERE rotated_to_session_id = $1
          AND rotation_successor_ciphertext IS NOT NULL
      `, [session.id]);

      const revoked = await client.query(`
        UPDATE mobile_parent_sessions
        SET is_active = false,
            revoked_at = to_timestamp($2 / 1000.0),
            last_used_at = to_timestamp($2 / 1000.0)
        WHERE id = $1
          AND is_active = true
          AND revoked_at IS NULL
          AND family_revoked_at IS NULL
        RETURNING id
      `, [session.id, now]);
      if (revoked.rowCount !== 1) return { kind: "invalid" };

      const nextGeneration = session.session_family_id
        ? (generation ?? -1) + 1
        : undefined;
      if (session.session_family_id && (!Number.isSafeInteger(nextGeneration) || nextGeneration! < 1)) {
        throw new Error("Mobile session generation is invalid.");
      }
      const successor = await this.issueSession(client, {
        parentId: session.parent_id,
        role: session.role,
        authRevocationEventId: latestRevocationEventId,
        databaseNow: now,
        refreshExpiresAt,
        familyId: session.session_family_id ?? undefined,
        sessionStartedAt: session.session_started_at
          ? new Date(timestampMs(session.session_started_at)!)
          : undefined,
        absoluteExpiresAt: session.absolute_expires_at
          ? new Date(absoluteExpiry!)
          : undefined,
        generation: nextGeneration,
      });

      let recoveryCiphertext: Buffer | null = null;
      let recoveryExpiresAt: number | null = null;
      if (operationId) {
        recoveryCiphertext = encryptRefreshToken(successor.refreshToken);
        recoveryExpiresAt = Math.min(
          now + IDEMPOTENCY_RECOVERY_MS,
          refreshExpiresAt,
          absoluteExpiry ?? Number.POSITIVE_INFINITY,
        );
      }

      await client.query(`
        UPDATE mobile_parent_sessions
        SET rotated_to_session_id = $1,
            rotation_request_id = $2,
            rotation_successor_ciphertext = $3,
            rotation_recovery_expires_at = CASE
              WHEN $4::bigint IS NULL THEN NULL
              ELSE to_timestamp($4 / 1000.0)
            END
        WHERE id = $5
      `, [successor.sessionId, operationId ?? null, recoveryCiphertext, recoveryExpiresAt, session.id]);

      return {
        kind: "rotated",
        tokens: { accessToken: successor.accessToken, refreshToken: successor.refreshToken },
      };
    });

    if (outcome.kind === "disabled") {
      throw new MobileSessionAuthorizationError("account_disabled");
    }
    if (outcome.kind === "invalid") return null;
    return outcome.tokens;
  }

  private static async revokeRowsForSession(
    client: PoolClient,
    parentId: string,
    session: SessionRow,
    now: Date,
  ): Promise<void> {
    if (session.session_family_id) {
      await client.query(`
        UPDATE mobile_parent_sessions
        SET is_active = false,
            revoked_at = COALESCE(revoked_at, $3),
            family_revoked_at = COALESCE(family_revoked_at, $3),
            rotation_request_id = NULL,
            rotation_successor_ciphertext = NULL,
            rotation_recovery_expires_at = NULL
        WHERE parent_id = $1 AND session_family_id = $2
      `, [parentId, session.session_family_id, now]);
      return;
    }

    const { rows } = await client.query<{ id: number; rotated_to_session_id: number | null }>(`
      SELECT id, rotated_to_session_id
      FROM mobile_parent_sessions
      WHERE parent_id = $1
      FOR UPDATE
    `, [parentId]);
    const linkedSessionIds = new Set<number>([session.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of rows) {
        if (
          linkedSessionIds.has(candidate.id)
          || (candidate.rotated_to_session_id != null && linkedSessionIds.has(candidate.rotated_to_session_id))
        ) {
          if (!linkedSessionIds.has(candidate.id)) {
            linkedSessionIds.add(candidate.id);
            changed = true;
          }
          if (candidate.rotated_to_session_id != null && !linkedSessionIds.has(candidate.rotated_to_session_id)) {
            linkedSessionIds.add(candidate.rotated_to_session_id);
            changed = true;
          }
        }
      }
    }

    await client.query(`
      UPDATE mobile_parent_sessions
      SET is_active = false,
          revoked_at = COALESCE(revoked_at, $3),
          family_revoked_at = COALESCE(family_revoked_at, $3),
          rotation_request_id = NULL,
          rotation_successor_ciphertext = NULL,
          rotation_recovery_expires_at = NULL
      WHERE parent_id = $1 AND id = ANY($2::integer[])
    `, [parentId, [...linkedSessionIds], now]);
  }

  public static async revokeSession(parentId: string, refreshToken: string): Promise<void> {
    const parsedParentId = Number(parentId);
    if (!Number.isSafeInteger(parsedParentId) || parsedParentId <= 0) return;
    const hash = hashRefreshToken(refreshToken);
    await this.withTransaction(async (client) => {
      const account = await this.lockAccount(client, parentId);
      if (!account) return;
      const { rows } = await client.query<SessionRow>(`
        SELECT *
        FROM mobile_parent_sessions
        WHERE parent_id = $1 AND refresh_token_hash = $2
        FOR UPDATE
      `, [parentId, hash]);
      if (rows[0]) {
        await this.revokeRowsForSession(client, parentId, rows[0], new Date(timestampMs(account.database_now)!));
      }
    });
    logger.info("A mobile parent session family was revoked.");
  }

  public static async revokeAllSessions(parentId: string): Promise<void> {
    const parsedParentId = Number(parentId);
    if (!Number.isSafeInteger(parsedParentId) || parsedParentId <= 0) return;
    await this.withTransaction(async (client) => {
      const account = await this.lockAccount(client, parentId);
      if (!account) return;
      const now = timestampMs(account.database_now);
      if (now == null) throw new Error("Database returned an invalid session time.");
      await this.revokeParentRows(client, parentId, new Date(now));
    });
    logger.audit("REVOKE_ALL_SESSIONS", parentId, { parentId }, "SUCCESS");
  }

  public static verifyInternalSignature(body: string, signature: string, timestamp: string): boolean {
    const internalSecret = process.env.INTERNAL_SECRET;
    if (!internalSecret || !internalSecret.trim()) {
      logger.error("INTERNAL_SECRET environment variable is missing or empty");
      return false;
    }

    if (!/^[0-9a-f]{64}$/i.test(signature) || !/^\d{13}$/.test(timestamp)) return false;
    const requestTime = Number(timestamp);
    if (!Number.isSafeInteger(requestTime) || Math.abs(Date.now() - requestTime) > 5 * 60 * 1000) {
      return false;
    }

    const expected = crypto.createHmac("sha256", internalSecret)
      .update(`${body}${timestamp}`)
      .digest();
    const supplied = Buffer.from(signature, "hex");
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  }
}
