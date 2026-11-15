export interface ParentSessionSecretBridge {
  readSessionSecret(key: string): string | null;
  writeSessionSecret(key: string, value: string): boolean;
  deleteSessionSecret(key: string): boolean;
  readParentRefreshState?(): string | null;
  writeParentRefreshState?(value: string): boolean;
  deleteParentRefreshState?(): boolean;
}

export interface ParentRefreshState {
  refreshToken: string;
  pendingOperationId: string | null;
}

const SESSION_SECRET_KEYS = new Set([
  "ecoletrack_token",
  "ecoletrack_refresh_token",
  "ecoletrack_refresh_operation_id",
]);
const REFRESH_STATE_UNAVAILABLE = "__ECOLETRACK_REFRESH_STATE_UNAVAILABLE__";

const supportsAtomicRefreshState = (
  bridge?: ParentSessionSecretBridge,
): bridge is ParentSessionSecretBridge & Required<
  Pick<ParentSessionSecretBridge, "readParentRefreshState" | "writeParentRefreshState" | "deleteParentRefreshState">
> => Boolean(
  bridge?.readParentRefreshState
  && bridge.writeParentRefreshState
  && bridge.deleteParentRefreshState,
);

const parseParentRefreshState = (serialized: string): ParentRefreshState | null => {
  try {
    const value = JSON.parse(serialized) as Partial<ParentRefreshState>;
    if (
      typeof value.refreshToken !== "string"
      || !value.refreshToken
      || (
        value.pendingOperationId !== undefined
        && value.pendingOperationId !== null
        && (typeof value.pendingOperationId !== "string" || !value.pendingOperationId)
      )
    ) {
      return null;
    }
    return {
      refreshToken: value.refreshToken,
      pendingOperationId: value.pendingOperationId || null,
    };
  } catch {
    return null;
  }
};

export const readParentSessionSecret = (
  key: string,
  storage: Pick<Storage, "getItem" | "removeItem">,
  bridge?: ParentSessionSecretBridge,
): string | null => {
  if (!SESSION_SECRET_KEYS.has(key)) throw new Error("Unsupported parent session secret.");

  const secureValue = bridge?.readSessionSecret(key);
  if (secureValue) return secureValue;

  const legacyValue = storage.getItem(key);
  if (!legacyValue) return null;
  if (bridge) {
    if (!bridge.writeSessionSecret(key, legacyValue)) {
      console.warn("Unable to migrate the stored parent session to secure storage.");
      return legacyValue;
    }
    storage.removeItem(key);
  }
  return legacyValue;
};

export const readParentRefreshState = (
  storage: Pick<Storage, "getItem" | "removeItem">,
  bridge?: ParentSessionSecretBridge,
): ParentRefreshState | null => {
  if (supportsAtomicRefreshState(bridge)) {
    let serialized: string | null;
    try {
      serialized = bridge.readParentRefreshState();
    } catch (error) {
      console.error("Unable to read the parent refresh state from secure storage.", error);
      return null;
    }

    if (serialized === REFRESH_STATE_UNAVAILABLE) {
      console.error("The encrypted parent refresh state is temporarily unavailable.");
      return null;
    }
    if (serialized) {
      const state = parseParentRefreshState(serialized);
      if (state) return state;
      console.error("The stored parent refresh state is invalid.");
      return null;
    }
  }

  const refreshToken = readParentSessionSecret(
    "ecoletrack_refresh_token",
    storage,
    bridge,
  );
  if (!refreshToken) return null;

  const state: ParentRefreshState = {
    refreshToken,
    pendingOperationId: readParentSessionSecret(
      "ecoletrack_refresh_operation_id",
      storage,
      bridge,
    ),
  };

  if (supportsAtomicRefreshState(bridge)) {
    try {
      if (bridge.writeParentRefreshState(JSON.stringify(state))) {
        for (const key of ["ecoletrack_refresh_token", "ecoletrack_refresh_operation_id"]) {
          try {
            removeParentSessionSecret(key, storage, bridge);
          } catch (error) {
            console.warn("The legacy parent refresh secret remains after secure migration.", error);
            storage.removeItem(key);
          }
        }
      } else {
        console.warn("Unable to migrate the parent refresh state to atomic secure storage.");
      }
    } catch (error) {
      console.warn("Unable to migrate the parent refresh state to atomic secure storage.", error);
    }
  }

  return state;
};

export const writeParentRefreshState = (
  state: ParentRefreshState,
  storage: Pick<Storage, "setItem" | "removeItem">,
  bridge?: ParentSessionSecretBridge,
): void => {
  if (supportsAtomicRefreshState(bridge)) {
    if (!bridge.writeParentRefreshState(JSON.stringify(state))) {
      throw new Error("Unable to persist the parent refresh state atomically in secure storage.");
    }
    for (const key of ["ecoletrack_refresh_token", "ecoletrack_refresh_operation_id"]) {
      try {
        removeParentSessionSecret(key, storage, bridge);
      } catch (error) {
        console.warn("The legacy parent refresh secret remains after atomic state update.", error);
        storage.removeItem(key);
      }
    }
    return;
  }

  throw new Error("Atomic parent refresh-state storage is unavailable.");
};

export const removeParentRefreshState = (
  storage: Pick<Storage, "removeItem">,
  bridge?: ParentSessionSecretBridge,
): void => {
  let removalFailed = supportsAtomicRefreshState(bridge)
    && !bridge.deleteParentRefreshState();
  for (const key of ["ecoletrack_refresh_token", "ecoletrack_refresh_operation_id"]) {
    try {
      removeParentSessionSecret(key, storage, bridge);
    } catch (error) {
      removalFailed = true;
      storage.removeItem(key);
      console.error("Unable to clear a legacy parent refresh secret from secure storage.", error);
    }
  }
  if (removalFailed) {
    throw new Error("Unable to remove the parent refresh state from secure storage.");
  }
};

export const writeParentSessionSecret = (
  key: string,
  value: string,
  storage: Pick<Storage, "setItem" | "removeItem">,
  bridge?: ParentSessionSecretBridge,
): void => {
  if (!SESSION_SECRET_KEYS.has(key)) throw new Error("Unsupported parent session secret.");
  if (bridge) {
    if (!bridge.writeSessionSecret(key, value)) {
      throw new Error("Unable to persist the parent session in secure storage.");
    }
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, value);
};

export const removeParentSessionSecret = (
  key: string,
  storage: Pick<Storage, "removeItem">,
  bridge?: ParentSessionSecretBridge,
): void => {
  if (!SESSION_SECRET_KEYS.has(key)) throw new Error("Unsupported parent session secret.");
  if (bridge && !bridge.deleteSessionSecret(key)) {
    throw new Error("Unable to remove the parent session from secure storage.");
  }
  storage.removeItem(key);
};
