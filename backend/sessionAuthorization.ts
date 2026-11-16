import type { NextFunction, Request, Response } from "express";

export interface MobileSessionClaims {
  parentId: string;
  role: string;
  authRevocationEventId?: unknown;
  sessionId?: number;
  sessionFamilyId?: string;
  refreshGeneration?: number;
  absoluteExpiresAt?: number;
  exp?: number;
}

export interface MobileSessionAuthorizationRecord {
  id: number;
  parentId: string | null;
  role: string | null;
  isActive: boolean | null;
  revokedAt: Date | string | null;
  expiresAt: Date | string | null;
  familyId: string | null;
  generation: number | null;
  absoluteExpiresAt: Date | string | null;
  familyRevokedAt: Date | string | null;
}

export interface MobileAccountAuthorizationState {
  role: string;
  isDeleted: boolean;
  latestRevocationEventId: number;
  session?: MobileSessionAuthorizationRecord | null;
}

export type MobileSessionRejection = "invalid_session" | "account_disabled" | "session_revoked";
export type MobileSessionRejectionReason =
  | "invalid_claims"
  | "account_disabled"
  | "revocation_boundary"
  | "session_not_found"
  | "session_identity_mismatch"
  | "session_inactive"
  | "session_revoked"
  | "session_expired"
  | "absolute_session_expired"
  | "session_family_mismatch"
  | "session_generation_mismatch"
  | "absolute_expiry_claim_mismatch";

export interface AuthenticatedMobileRequest extends Request {
  parent?: {
    id: string;
    email: string;
    role: string;
  };
}

export const getMobileAccountRejectionReason = (
  claims: MobileSessionClaims,
  state: Pick<MobileAccountAuthorizationState, "role" | "isDeleted" | "latestRevocationEventId"> | null,
): MobileSessionRejectionReason | null => {
  if (!claims.parentId || claims.role !== "parent" || !state || state.role !== claims.role) {
    return "invalid_claims";
  }
  if (state.isDeleted) {
    return "account_disabled";
  }
  if (state.latestRevocationEventId > 0
    && (typeof claims.authRevocationEventId !== "number"
      || !Number.isSafeInteger(claims.authRevocationEventId)
      || claims.authRevocationEventId < state.latestRevocationEventId)) {
    return "revocation_boundary";
  }
  return null;
};

export const getMobileSessionRejectionReason = (
  claims: MobileSessionClaims,
  state: MobileAccountAuthorizationState | null,
): MobileSessionRejectionReason | null => {
  const accountRejection = getMobileAccountRejectionReason(claims, state);
  if (accountRejection) return accountRejection;
  if (claims.sessionId !== undefined) {
    if (!Number.isSafeInteger(claims.sessionId) || claims.sessionId <= 0) {
      return "session_identity_mismatch";
    }
    const session = state?.session;
    if (!session) return "session_not_found";
    if (
      session.id !== claims.sessionId
      || session.parentId !== claims.parentId
      || session.role !== claims.role
    ) return "session_identity_mismatch";
    if (!session.isActive) return "session_inactive";
    if (session.revokedAt != null || session.familyRevokedAt != null) {
      return "session_revoked";
    }

    const now = Date.now();
    const expiresAt = session.expiresAt == null
      ? Number.NaN
      : new Date(session.expiresAt).getTime();
    const absoluteExpiresAt = session.absoluteExpiresAt == null
      ? null
      : new Date(session.absoluteExpiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= now
      || (claims.exp !== undefined && (!Number.isSafeInteger(claims.exp) || claims.exp <= now))) {
      return "session_expired";
    }
    if (absoluteExpiresAt !== null
      && (!Number.isFinite(absoluteExpiresAt) || absoluteExpiresAt <= now)) {
      return "absolute_session_expired";
    }
    if (session.familyId !== null) {
      if (claims.sessionFamilyId !== session.familyId) return "session_family_mismatch";
      if (claims.refreshGeneration !== session.generation) return "session_generation_mismatch";
      if (claims.absoluteExpiresAt !== absoluteExpiresAt) return "absolute_expiry_claim_mismatch";
    } else if (
      claims.sessionFamilyId !== undefined
      || claims.refreshGeneration !== undefined
      || claims.absoluteExpiresAt !== undefined
    ) {
      return "session_family_mismatch";
    }
  }
  return null;
};

export const getMobileSessionRejection = (
  claims: MobileSessionClaims,
  state: MobileAccountAuthorizationState | null,
): MobileSessionRejection | null => {
  const reason = getMobileSessionRejectionReason(claims, state);
  if (reason == null) return null;
  if (reason === "invalid_claims") return "invalid_session";
  if (reason === "account_disabled") return "account_disabled";
  return "session_revoked";
};

export const createMobileRequireAuth = (
  verifyToken: (token: string) => MobileSessionClaims | null,
  getAccountState: (
    parentId: string,
    claims: MobileSessionClaims,
  ) => Promise<MobileAccountAuthorizationState | null>,
  logStatusError: (error: unknown) => void,
) => async (req: AuthenticatedMobileRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Authentification requise. Jeton de session manquant.",
      code: "UNAUTHORIZED"
    });
  }

  const decoded = verifyToken(authHeader.slice("Bearer ".length).trim());
  if (!decoded) {
    return res.status(401).json({
      error: "Session invalide ou expirée. Veuillez vous reconnecter.",
      code: "INVALID_SESSION"
    });
  }

  if (decoded.role !== "parent") {
    req.parent = { id: decoded.parentId, email: "", role: decoded.role };
    return next();
  }

  try {
    const state = await getAccountState(decoded.parentId, decoded);
    const rejection = getMobileSessionRejection(decoded, state);
    if (rejection) {
      const accountDisabled = rejection === "account_disabled";
      return res.status(401).json({
        error: accountDisabled
          ? "Ce compte est désactivé. Contactez votre administrateur."
          : "Session invalide ou révoquée. Veuillez vous reconnecter.",
        code: accountDisabled ? "ACCOUNT_DISABLED" : "INVALID_SESSION"
      });
    }

    req.parent = { id: decoded.parentId, email: "", role: decoded.role };
    return next();
  } catch (error) {
    logStatusError(error);
    return res.status(503).json({
      error: "Vérification de la session indisponible. Réessayez.",
      code: "AUTH_STATUS_UNAVAILABLE"
    });
  }
}
