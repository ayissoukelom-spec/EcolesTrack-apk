import type { NextFunction, Request, Response } from "express";

export interface MobileSessionClaims {
  parentId: string;
  role: string;
  authRevocationEventId?: unknown;
}

export interface MobileAccountAuthorizationState {
  role: string;
  isDeleted: boolean;
  latestRevocationEventId: number;
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
  return null;
};

export const createMobileRequireAuth = (
  verifyToken: (token: string) => MobileSessionClaims | null,
  getAccountState: (parentId: string) => Promise<MobileAccountAuthorizationState | null>,
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
    const state = await getAccountState(decoded.parentId);
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
