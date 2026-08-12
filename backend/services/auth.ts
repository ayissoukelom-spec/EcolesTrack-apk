import crypto from "crypto";
import { Logger } from "../utils/logger";
import { dbQuery } from "../postgres";

const logger = new Logger("AuthService");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || !JWT_SECRET.trim()) {
  throw new Error("JWT_SECRET environment variable is required");
}

const ACCESS_TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 Minutes
const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 Days

export interface TokenPayload {
  parentId: string;
  role: string;
  exp: number;
}

function hashRefreshToken(refreshToken: string): string {
  return crypto.createHash("sha256").update(refreshToken).digest("hex");
}

interface PersistedSession {
  id: number;
  parent_id: string;
  role: string;
  refresh_token_hash: string;
  is_active: boolean;
  expires_at: string;
}

export class AuthService {
  /**
   * Generates a secure JWT-like token
   */
  private static generateJWT(payload: any, secret: string, durationMs: number): string {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const data = Buffer.from(JSON.stringify({ 
      ...payload, 
      exp: Date.now() + durationMs 
    })).toString("base64url");
    
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(`${header}.${data}`);
    const signature = hmac.digest("base64url");
    
    return `${header}.${data}.${signature}`;
  }

  /**
   * Verifies a JWT token signature and expiration
   */
  public static verifyJWT(token: string, secret: string = JWT_SECRET): TokenPayload | null {
    try {
      const [header, data, signature] = token.split(".");
      if (!header || !data || !signature) return null;
      
      const hmac = crypto.createHmac("sha256", secret);
      hmac.update(`${header}.${data}`);
      const expectedSignature = hmac.digest("base64url");
      
      if (signature !== expectedSignature) {
        logger.warn("JWT Signature verification failed.");
        return null;
      }
      
      const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf-8"));
      if (payload.exp < Date.now()) {
        logger.debug("JWT Token has expired.");
        return null; // Expired
      }
      
      return payload;
    } catch (e) {
      logger.error("Error verifying JWT token", e);
      return null;
    }
  }

  /**
   * Generates a pair of (Access Token, Refresh Token) for a user session
   */
  public static async createSession(parentId: string, role: string): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.generateJWT({ parentId, role }, JWT_SECRET, ACCESS_TOKEN_EXPIRY_MS);
    const entropy = crypto.randomBytes(16).toString("hex");
    const refreshToken = this.generateJWT({ parentId, role, entropy }, JWT_SECRET, REFRESH_TOKEN_EXPIRY_MS);
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS).toISOString();

    await dbQuery(`
      INSERT INTO mobile_parent_sessions (parent_id, role, refresh_token_hash, expires_at, is_active)
      VALUES ($1, $2, $3, $4, true)
    `, [parentId, role, refreshTokenHash, expiresAt]);

    logger.info(`Session created for parent: ${parentId}`);
    return { accessToken, refreshToken };
  }

  /**
   * Rotates a Refresh Token (Refresh Token Rotation - RTR)
   * Prevents replay attacks by invalidating the old Refresh Token and issuing a new pair.
   */
  private static async ensureSessionRecordForToken(parentId: string, role: string, refreshToken: string, expiresAt: string): Promise<PersistedSession> {
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const { rows } = await dbQuery<PersistedSession>(`
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

    const result = await dbQuery<PersistedSession>(`
      SELECT id, parent_id, role, refresh_token_hash, is_active, expires_at
      FROM mobile_parent_sessions
      WHERE refresh_token_hash = $1
      LIMIT 1
    `, [refreshTokenHash]);

    return result.rows[0];
  }

  public static async rotateSession(oldRefreshToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
    const payload = this.verifyJWT(oldRefreshToken);
    if (!payload) {
      logger.warn("Rotation attempted with invalid or expired Refresh Token.");
      return null;
    }

    const { parentId, role, exp } = payload;
    const refreshTokenHash = hashRefreshToken(oldRefreshToken);
    const expiresAt = new Date(exp).toISOString();

    const existingSession = await this.ensureSessionRecordForToken(parentId, role, oldRefreshToken, expiresAt);
    if (!existingSession.is_active) {
      logger.warn(`Refresh Token not found or inactive for parent: ${parentId}`);
      return null;
    }

    if (new Date(existingSession.expires_at).getTime() < Date.now()) {
      logger.warn(`Refresh Token expired in DB for parent: ${parentId}`);
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
  public static async revokeSession(parentId: string, refreshToken: string) {
    const refreshTokenHash = hashRefreshToken(refreshToken);

    await dbQuery(`
      UPDATE mobile_parent_sessions
      SET is_active = false, revoked_at = now()
      WHERE parent_id = $1 AND refresh_token_hash = $2 AND is_active = true
    `, [parentId, refreshTokenHash]);

    logger.info(`Session revoked for parent: ${parentId}`);
  }

  /**
   * Revokes all sessions for a user (e.g., when a compromise is detected)
   */
  public static async revokeAllSessions(parentId: string) {
    await dbQuery(`
      UPDATE mobile_parent_sessions
      SET is_active = false, revoked_at = now()
      WHERE parent_id = $1 AND is_active = true
    `, [parentId]);

    logger.audit("REVOKE_ALL_SESSIONS", parentId, { parentId }, "SUCCESS");
  }

  /**
   * Verifies HMAC-SHA256 signature for internal server-to-server calls
   * Requires: X-Internal-Signature and X-Internal-Timestamp headers
   * Signature format: HMAC-SHA256(body + timestamp, INTERNAL_SECRET)
   * Prevents: Unauthorized callers, request forgery, replay attacks
   */
  public static verifyInternalSignature(body: string, signature: string, timestamp: string): boolean {
    const INTERNAL_SECRET = process.env.INTERNAL_SECRET;
    if (!INTERNAL_SECRET || !INTERNAL_SECRET.trim()) {
      logger.error("INTERNAL_SECRET environment variable is missing or empty");
      return false;
    }

    if (!signature || !timestamp) {
      logger.warn("Missing internal signature or timestamp headers");
      return false;
    }

    // Replay protection: reject timestamps older than 5 minutes
    const requestTime = parseInt(timestamp, 10);
    const currentTime = Date.now();
    const maxTimestampAge = 5 * 60 * 1000; // 5 minutes

    if (isNaN(requestTime) || Math.abs(currentTime - requestTime) > maxTimestampAge) {
      logger.warn(`Timestamp replay detected or invalid: requested=${requestTime}, now=${currentTime}, diff=${Math.abs(currentTime - requestTime)}ms`);
      return false;
    }

    // Verify HMAC signature
    const messageToSign = `${body}${timestamp}`;
    const hmac = crypto.createHmac("sha256", INTERNAL_SECRET);
    hmac.update(messageToSign);
    const expectedSignature = hmac.digest("hex");

    const isValid = signature === expectedSignature;
    if (!isValid) {
      logger.warn(`HMAC signature mismatch: expected=${expectedSignature}, received=${signature}`);
    }

    return isValid;
  }
}
