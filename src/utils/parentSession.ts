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
