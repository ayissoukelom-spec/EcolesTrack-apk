import crypto from "crypto";
import { Logger } from "../utils/logger";

const logger = new Logger("AuthService");

const JWT_SECRET = process.env.JWT_SECRET || "ecoletrack-super-secret-key-2026";
const ACCESS_TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 Minutes
const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 Days

export interface TokenPayload {
  parentId: string;
  role: string;
  exp: number;
}

// In-Memory Redis Mock for revoked/blacklisted Refresh Tokens (rotation protection)
const tokenBlacklist = new Set<string>();

// Track active sessions: Maps Parent ID -> Set of Active Refresh Tokens
const activeSessions = new Map<string, Set<string>>();

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
  public static createSession(parentId: string, role: string): { accessToken: string; refreshToken: string } {
    const accessToken = this.generateJWT({ parentId, role }, JWT_SECRET, ACCESS_TOKEN_EXPIRY_MS);
    
    // Refresh Token contains random entropy to guarantee uniqueness
    const entropy = crypto.randomBytes(16).toString("hex");
    const refreshToken = this.generateJWT({ parentId, role, entropy }, JWT_SECRET, REFRESH_TOKEN_EXPIRY_MS);
    
    // Track active session
    if (!activeSessions.has(parentId)) {
      activeSessions.set(parentId, new Set());
    }
    activeSessions.get(parentId)!.add(refreshToken);
    
    logger.info(`Session created for parent: ${parentId}`);
    return { accessToken, refreshToken };
  }

  /**
   * Rotates a Refresh Token (Refresh Token Rotation - RTR)
   * Prevents replay attacks by invalidating the old Refresh Token and issuing a new pair.
   */
  public static rotateSession(oldRefreshToken: string): { accessToken: string; refreshToken: string } | null {
    // 1. Verify token signature
    const payload = this.verifyJWT(oldRefreshToken);
    if (!payload) {
      logger.warn("Rotation attempted with invalid or expired Refresh Token.");
      return null;
    }

    const { parentId, role } = payload;

    // 2. Check if Refresh Token is blacklisted (compromised)
    if (tokenBlacklist.has(oldRefreshToken)) {
      logger.warn(`[SECURITY ALERT] Replay attack detected! Compromised Refresh Token reused for parent ID: ${parentId}. Revoking all sessions!`);
      this.revokeAllSessions(parentId); // Security measure: Revoke everything!
      return null;
    }

    // 3. Blacklist the old token now
    tokenBlacklist.add(oldRefreshToken);

    // 4. Verify old token was in active sessions list
    const parentTokens = activeSessions.get(parentId);
    if (!parentTokens || !parentTokens.has(oldRefreshToken)) {
      logger.warn(`Refresh Token not found in active session list for parent: ${parentId}`);
      return null;
    }

    // Remove old token from active list
    parentTokens.delete(oldRefreshToken);

    // 5. Generate new session pair
    const newSession = this.createSession(parentId, role);
    return newSession;
  }

  /**
   * Revokes a specific session (Logout)
   */
  public static revokeSession(parentId: string, refreshToken: string) {
    tokenBlacklist.add(refreshToken);
    const parentTokens = activeSessions.get(parentId);
    if (parentTokens) {
      parentTokens.delete(refreshToken);
    }
    logger.info(`Session revoked for parent: ${parentId}`);
  }

  /**
   * Revokes all sessions for a user (e.g., when a compromise is detected)
   */
  public static revokeAllSessions(parentId: string) {
    const parentTokens = activeSessions.get(parentId);
    if (parentTokens) {
      parentTokens.forEach(token => tokenBlacklist.add(token));
      activeSessions.delete(parentId);
    }
    logger.audit("REVOKE_ALL_SESSIONS", parentId, { parentId }, "SUCCESS");
  }
}
