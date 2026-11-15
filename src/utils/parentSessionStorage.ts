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

export type ParentSessionSecretReadResult =
  | { status: "available"; value: string }
  | { status: "missing" }
  | { status: "temporarily-unavailable" }
  | { status: "unrecoverable" };

export type ParentRefreshStateReadResult =
  | { status: "available"; state: ParentRefreshState }
  | { status: "missing" }
  | { status: "temporarily-unavailable" }
  | { status: "unrecoverable" };

const SESSION_SECRET_KEYS = new Set([
  "ecoletrack_token",
  "ecoletrack_refresh_token",
  "ecoletrack_refresh_operation_id",
]);
const REFRESH_STATE_TEMPORARILY_UNAVAILABLE = "__ECOLETRACK_REFRESH_STATE_TEMPORARILY_UNAVAILABLE__";
const REFRESH_STATE_UNAVAILABLE = "__ECOLETRACK_REFRESH_STATE_UNAVAILABLE__";
const REFRESH_STATE_UNRECOVERABLE = "__ECOLETRACK_REFRESH_STATE_UNRECOVERABLE__";
const SESSION_SECRET_TEMPORARILY_UNAVAILABLE = "__ECOLETRACK_SESSION_SECRET_TEMPORARILY_UNAVAILABLE__";
const SESSION_SECRET_UNRECOVERABLE = "__ECOLETRACK_SESSION_SECRET_UNRECOVERABLE__";

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
): ParentSessionSecretReadResult => {
  if (!SESSION_SECRET_KEYS.has(key)) throw new Error("Unsupported parent session secret.");

  if (bridge) {
    let secureValue: string | null;
    try {
      secureValue = bridge.readSessionSecret(key);
    } catch {
      console.warn("The Android secure session storage is temporarily unavailable.");
      return { status: "temporarily-unavailable" };
    }
    if (secureValue === SESSION_SECRET_TEMPORARILY_UNAVAILABLE) {
      console.warn("The Android secure session storage is temporarily unavailable.");
      return { status: "temporarily-unavailable" };
    }
    if (secureValue === SESSION_SECRET_UNRECOVERABLE) {
      console.error("The encrypted Android session secret cannot be recovered.");
      return { status: "unrecoverable" };
    }
    if (secureValue) return { status: "available", value: secureValue };
  }

  let legacyValue: string | null;
  try {
    legacyValue = storage.getItem(key);
  } catch {
    console.warn("The legacy parent session storage is temporarily unavailable.");
    return { status: "temporarily-unavailable" };
  }
  if (!legacyValue) return { status: "missing" };
  if (bridge) {
    try {
      if (!bridge.writeSessionSecret(key, legacyValue)) {
        console.warn("Unable to migrate the stored parent session to secure storage.");
        return { status: "temporarily-unavailable" };
      }
      storage.removeItem(key);
    } catch {
      console.warn("Unable to migrate the stored parent session to secure storage.");
      return { status: "temporarily-unavailable" };
    }
  }
  return { status: "available", value: legacyValue };
};

export const readParentRefreshState = (
  storage: Pick<Storage, "getItem" | "removeItem">,
  bridge?: ParentSessionSecretBridge,
): ParentRefreshStateReadResult => {
  if (supportsAtomicRefreshState(bridge)) {
    let serialized: string | null;
    try {
      serialized = bridge.readParentRefreshState();
    } catch {
      console.warn("The Android refresh state is temporarily unavailable.");
      return { status: "temporarily-unavailable" };
    }

    if (
      serialized === REFRESH_STATE_TEMPORARILY_UNAVAILABLE
      || serialized === REFRESH_STATE_UNAVAILABLE
    ) {
      console.warn("The Android refresh state is temporarily unavailable.");
      return { status: "temporarily-unavailable" };
    }
    if (serialized === REFRESH_STATE_UNRECOVERABLE) {
      console.error("The encrypted Android refresh state cannot be recovered.");
      return { status: "unrecoverable" };
    }
    if (serialized) {
      const state = parseParentRefreshState(serialized);
      if (state) return { status: "available", state };
      console.error("The encrypted Android refresh state is invalid.");
      return { status: "unrecoverable" };
    }
  }

  const refreshTokenResult = readParentSessionSecret(
    "ecoletrack_refresh_token",
    storage,
    bridge,
  );
  if (refreshTokenResult.status !== "available") {
    return refreshTokenResult.status === "missing"
      ? { status: "missing" }
      : { status: refreshTokenResult.status };
  }

  const operationIdResult = readParentSessionSecret(
    "ecoletrack_refresh_operation_id",
    storage,
    bridge,
  );
  if (
    operationIdResult.status === "temporarily-unavailable"
    || operationIdResult.status === "unrecoverable"
  ) {
    return { status: operationIdResult.status };
  }

  const state: ParentRefreshState = {
    refreshToken: refreshTokenResult.value,
    pendingOperationId: operationIdResult.status === "available"
      ? operationIdResult.value
      : null,
  };

  if (supportsAtomicRefreshState(bridge)) {
    try {
      if (!bridge.writeParentRefreshState(JSON.stringify(state))) {
        console.warn("Unable to migrate the parent refresh state to atomic secure storage.");
        return { status: "temporarily-unavailable" };
      }
      for (const key of ["ecoletrack_refresh_token", "ecoletrack_refresh_operation_id"]) {
        try {
          removeParentSessionSecret(key, storage, bridge);
        } catch {
          storage.removeItem(key);
          console.warn("A legacy parent refresh secret remains in secure storage.");
        }
      }
    } catch {
      console.warn("Unable to migrate the parent refresh state to atomic secure storage.");
      return { status: "temporarily-unavailable" };
    }
  }

  return { status: "available", state };
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
      } catch {
        console.warn("The legacy parent refresh secret remains after atomic state update.");
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
    } catch {
      removalFailed = true;
      storage.removeItem(key);
      console.error("Unable to clear a legacy parent refresh secret from secure storage.");
    }
  }
  if (removalFailed) {
    throw new Error("Unable to remove the parent refresh state from secure storage.");
  }
};

export const writeParentSessionSecret = (
  key: string,
  value: string,
  storage: Pick<Storage, "removeItem">,
  bridge?: ParentSessionSecretBridge,
): void => {
  if (!SESSION_SECRET_KEYS.has(key)) throw new Error("Unsupported parent session secret.");
  if (!bridge) {
    throw new Error("Android secure session storage is unavailable.");
  }
  if (!bridge.writeSessionSecret(key, value)) {
    throw new Error("Unable to persist the parent session in secure storage.");
  }
  storage.removeItem(key);
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
