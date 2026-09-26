export function getPushAssociationKey(
  parentId: string | number | null | undefined,
  deviceId: string | null | undefined,
  pushToken: string | null | undefined,
): string | null {
  if (parentId == null || String(parentId).trim() === '' || !deviceId || !pushToken) {
    return null;
  }

  return JSON.stringify([String(parentId), deviceId, pushToken]);
}

export function shouldRegisterPushAssociation(
  associationKey: string | null,
  lastRegisteredKey: string | null,
  registeringKey: string | null,
): boolean {
  return Boolean(associationKey)
    && associationKey !== lastRegisteredKey
    && associationKey !== registeringKey;
}

export function getConfirmedPushAssociationKey(
  success: boolean,
  associationKey: string | null,
  activeAssociationKey: string | null,
  sessionIsCurrent: boolean,
): string | null {
  if (!success || !sessionIsCurrent || !associationKey || associationKey !== activeAssociationKey) {
    return null;
  }

  return associationKey;
}

export const PUSH_ASSOCIATION_REQUEST_TIMEOUT_MS = 20_000;

export async function withPushAssociationTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = PUSH_ASSOCIATION_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Push association request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export class PushAssociationQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}