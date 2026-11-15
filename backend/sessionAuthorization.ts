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

export interface AuthenticatedMobileRequest extends Request {
  parent?: {
    id: string;
    email: string;
    role: string;
  };
}

export const getMobileSessionRejection = (
  claims: MobileSessionClaims,
  state: MobileAccountAuthorizationState | null,
): MobileSessionRejection | null => {
  if (!claims.parentId || claims.role !== "parent" || !state || state.role !== claims.role) {
    return "invalid_session";
  }
  if (state.isDeleted) {
    return "account_disabled";
  }
  if (state.latestRevocationEventId > 0
    && (typeof claims.authRevocationEventId !== "number"
      || !Number.isSafeInteger(claims.authRevocationEventId)
      || claims.authRevocationEventId < state.latestRevocationEventId)) {
    return "session_revoked";
  }

  if (claims.sessionId !== undefined) {
    const session = state.session;
    if (
      !Number.isSafeInteger(claims.sessionId)
      || claims.sessionId <= 0
      || !session
      || session.id !== claims.sessionId
      || session.parentId !== claims.parentId
      || session.role !== claims.role
      || !session.isActive
      || session.revokedAt != null
      || session.familyRevokedAt != null
    ) {
      return "session_revoked";
    }

    const now = Date.now();
    const expiresAt = session.expiresAt == null
      ? Number.NaN
      : new Date(session.expiresAt).getTime();
    const absoluteExpiresAt = session.absoluteExpiresAt == null
      ? null
      : new Date(session.absoluteExpiresAt).getTime();
    if (
      !Number.isFinite(expiresAt)
      || expiresAt <= now
      || (absoluteExpiresAt !== null && (!Number.isFinite(absoluteExpiresAt) || absoluteExpiresAt <= now))
      || (claims.exp !== undefined && claims.exp <= now)
      || (
        session.familyId !== null
        && (
          claims.sessionFamilyId !== session.familyId
          || claims.refreshGeneration !== session.generation
          || claims.absoluteExpiresAt !== absoluteExpiresAt
        )
      )
      || (
        session.familyId === null
        && (
          claims.sessionFamilyId !== undefined
          || claims.refreshGeneration !== undefined
          || claims.absoluteExpiresAt !== undefined
        )
      )
    ) {
      return "session_revoked";
    }
  }
  return null;
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
