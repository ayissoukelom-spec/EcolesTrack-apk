import {
  removeParentRefreshState,
  removeParentSessionSecret,
  type ParentSessionSecretBridge,
} from "./parentSessionStorage";

export interface ParentSessionStorage {
  removeItem(key: string): void;
}

export const DISABLED_PARENT_MESSAGE = "Ce compte est désactivé. Contactez votre administrateur.";

export const clearPersistedParentSession = (
  storage: ParentSessionStorage,
  bridge?: ParentSessionSecretBridge,
): void => {
  try {
    removeParentRefreshState(storage, bridge);
  } catch (error) {
    console.error("Unable to clear the parent refresh state from secure storage.", error);
    storage.removeItem("ecoletrack_refresh_token");
    storage.removeItem("ecoletrack_refresh_operation_id");
  }
  try {
    removeParentSessionSecret("ecoletrack_token", storage, bridge);
  } catch (error) {
    console.error("Unable to clear a parent session secret from secure storage.", error);
    storage.removeItem("ecoletrack_token");
  }
  storage.removeItem("ecoletrack_parent");
};

export const getDisabledParentMessage = async (response: Pick<Response, "status" | "clone">): Promise<string | null> => {
  if (response.status !== 401) return null;

  try {
    const body = await response.clone().json() as { code?: unknown; error?: unknown };
    if (body.code !== "ACCOUNT_DISABLED") return null;
    return typeof body.error === "string" && body.error.trim()
      ? body.error
      : DISABLED_PARENT_MESSAGE;
  } catch {
    return null;
  }
};
