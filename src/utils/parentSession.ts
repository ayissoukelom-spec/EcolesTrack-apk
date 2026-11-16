import {
  removeParentRefreshState,
  removeParentSessionSecret,
  type ParentSessionSecretBridge,
} from "./parentSessionStorage";

export interface ParentSessionStorage {
  removeItem(key: string): void;
}

export type ParentLogoutReason = "manual" | "definitive";

export const DISABLED_PARENT_MESSAGE = "Ce compte est désactivé. Contactez votre administrateur.";

export interface ParentSessionSnapshot {
  accessToken: string | null;
  sessionGeneration: number;
  credentialVersion: number;
}

export const createParentSessionCorrelationId = (): string => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

type ParentSessionLog = (
  event: string,
  details: Record<string, string | number | boolean | null>,
) => void;

export const performParentProtectedRequest = async ({
  correlationId,
  initialSnapshot,
  initialToken,
  requestFactory,
  getCurrentSnapshot,
  refreshAccessToken,
  onSessionExpired,
  log,
}: {
  correlationId: string;
  initialSnapshot: ParentSessionSnapshot;
  initialToken: string;
  requestFactory: (authToken: string) => Promise<Response>;
  getCurrentSnapshot: () => ParentSessionSnapshot;
  refreshAccessToken: (requestCorrelationId?: string) => Promise<string | null>;
  onSessionExpired: (message: string | undefined, code: string | null) => void;
  log: ParentSessionLog;
}): Promise<Response | null> => {
  const sessionGeneration = initialSnapshot.sessionGeneration;
  let authToken = initialToken;
  let refreshAttempted = false;
  let credentialVersionAtStart = initialSnapshot.credentialVersion;
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let current = getCurrentSnapshot();
    if (current.sessionGeneration !== sessionGeneration) {
      log("protected-request-discarded-stale-session", {
        correlationId,
        sessionGeneration,
        credentialVersion: current.credentialVersion,
      });
      return null;
    }

    if (
      current.accessToken
      && (current.accessToken !== authToken || current.credentialVersion > credentialVersionAtStart)
    ) {
      authToken = current.accessToken;
      credentialVersionAtStart = current.credentialVersion;
    }

    const requestCredentialVersion = current.credentialVersion;
    log("protected-request-started", {
      correlationId,
      sessionGeneration,
      credentialVersion: requestCredentialVersion,
      attempt,
    });

    const response = await requestFactory(authToken);
    current = getCurrentSnapshot();
    if (current.sessionGeneration !== sessionGeneration) {
      log("protected-request-discarded-stale-session", {
        correlationId,
        sessionGeneration,
        credentialVersion: current.credentialVersion,
      });
      return null;
    }
    if (response.status !== 401) return response;

    const code = await getParentAuthErrorCode(response);
    const disabledMessage = await getDisabledParentMessage(response);
    current = getCurrentSnapshot();
    if (current.sessionGeneration !== sessionGeneration) {
      log("protected-request-discarded-stale-session", {
        correlationId,
        sessionGeneration,
        credentialVersion: current.credentialVersion,
      });
      return null;
    }
    log(attempt === 0 ? "protected-request-401" : "protected-request-401-after-refresh", {
      correlationId,
      sessionGeneration,
      credentialVersion: requestCredentialVersion,
      status: response.status,
      code,
      attempt,
    });

    if (code === "ACCOUNT_DISABLED") {
      log("protected-request-definitive-rejection", {
        correlationId,
        sessionGeneration,
        credentialVersion: current.credentialVersion,
        code,
      });
      onSessionExpired(disabledMessage ?? DISABLED_PARENT_MESSAGE, code);
      return null;
    }

    if (
      current.accessToken
      && (
        current.accessToken !== authToken
        || current.credentialVersion > requestCredentialVersion
      )
    ) {
      if (attempt + 1 < maxAttempts) {
        authToken = current.accessToken;
        credentialVersionAtStart = current.credentialVersion;
        log("protected-request-retry-current-token", {
          correlationId,
          sessionGeneration,
          credentialVersion: current.credentialVersion,
          attempt: attempt + 1,
        });
        continue;
      }
    }

    const rejectionIsCurrent = (
      current.credentialVersion === requestCredentialVersion
      && current.accessToken === authToken
    );
    if (
      code === "INVALID_SESSION"
      && rejectionIsCurrent
      && refreshAttempted
    ) {
      log("protected-request-definitive-rejection", {
        correlationId,
        sessionGeneration,
        credentialVersion: current.credentialVersion,
        code,
      });
      onSessionExpired("La session mobile a été invalidée.", code);
      return null;
    }

    if (refreshAttempted || attempt + 1 >= maxAttempts) {
      log("protected-request-retry-exhausted", {
        correlationId,
        sessionGeneration,
        credentialVersion: current.credentialVersion,
        code,
        attempt,
      });
      return null;
    }

    refreshAttempted = true;
    const refreshedToken = await refreshAccessToken(correlationId);
    current = getCurrentSnapshot();
    if (current.sessionGeneration !== sessionGeneration) {
      log("protected-request-discarded-stale-session", {
        correlationId,
        sessionGeneration,
        credentialVersion: current.credentialVersion,
      });
      return null;
    }
    if (current.accessToken && current.credentialVersion > requestCredentialVersion) {
      authToken = current.accessToken;
      credentialVersionAtStart = current.credentialVersion;
    } else if (refreshedToken) {
      authToken = refreshedToken;
      credentialVersionAtStart = current.credentialVersion;
    } else {
      return null;
    }
  }

  return null;
};

export const clearPersistedParentSession = (
  storage: ParentSessionStorage,
  bridge?: ParentSessionSecretBridge,
): void => {
  let secureStorageCleared = true;
  try {
    removeParentRefreshState(storage, bridge);
  } catch {
    secureStorageCleared = false;
    console.error("Unable to clear the parent refresh state from secure storage.");
    storage.removeItem("ecoletrack_refresh_token");
    storage.removeItem("ecoletrack_refresh_operation_id");
  }
  try {
    removeParentSessionSecret("ecoletrack_token", storage, bridge);
  } catch {
    secureStorageCleared = false;
    console.error("Unable to clear the parent access token from secure storage.");
    storage.removeItem("ecoletrack_token");
  }
  storage.removeItem("ecoletrack_parent");
  if (!secureStorageCleared) {
    throw new Error("Secure parent session storage could not be cleared.");
  }
};

export const getParentAuthErrorCode = async (
  response: Pick<Response, "clone">,
): Promise<string | null> => {
  try {
    const body = await response.clone().json() as { code?: unknown };
    return typeof body.code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(body.code)
      ? body.code
      : null;
  } catch {
    return null;
  }
};

export const isDefinitiveParentSessionError = (code: string | null): boolean => (
  code === "INVALID_SESSION" || code === "ACCOUNT_DISABLED"
);

export const getDisabledParentMessage = async (response: Pick<Response, "status" | "clone">): Promise<string | null> => {
  if (response.status !== 401) return null;

  const code = await getParentAuthErrorCode(response);
  if (code !== "ACCOUNT_DISABLED") return null;

  try {
    const body = await response.clone().json() as { error?: unknown };
    return typeof body.error === "string" && body.error.trim()
      ? body.error
      : DISABLED_PARENT_MESSAGE;
  } catch {
    return null;
  }
};
