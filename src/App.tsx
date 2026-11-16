/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Terminal, ShieldCheck, Play, RefreshCw, Trash2, Smartphone, 
  BookOpen, HelpCircle, Code, HelpCircle as HelpIcon 
} from "lucide-react";
// Réception du token Firebase envoyé par Android
declare global {
  interface Window {
    setFcmToken?: (token: string) => void;
    setNotificationTarget?: (target: string, dispatchId: string | null) => void;
    AndroidNotificationBridge?: {
      onNotificationBridgeReady?: (bridgeSessionId: string) => void;
      onNotificationTargetReceived?: (dispatchId: string, bridgeSessionId: string) => void;
      onDataInvalidationReceived?: (eventId: string) => void;
      clearPendingDataInvalidations?: () => void;
    };
    AndroidSessionBridge?: ParentSessionSecretBridge;
  }
}
import ParentPortal from "./components/ParentPortal";
import ThemeToggle from "./components/ThemeToggle";
import { Parent, Child, AppNotification } from "./types";
import { parseJsonSafe, withApiBase } from "./utils/http";
import { MobileVisitTracker } from "./utils/mobileVisit";
import {
  clearPersistedParentSession,
  createParentSessionCorrelationId,
  getDisabledParentMessage,
  getParentAuthErrorCode,
  isDefinitiveParentSessionError,
  performParentProtectedRequest,
  type ParentSessionSnapshot,
  type ParentLogoutReason,
} from "./utils/parentSession";
import {
  readParentRefreshState,
  readParentSessionSecret,
  writeParentRefreshState,
  writeParentSessionSecret,
  type ParentRefreshState,
  type ParentRefreshStateReadResult,
  type ParentSessionSecretReadResult,
  type ParentSessionSecretBridge,
} from "./utils/parentSessionStorage";
import { getNotificationNavigationRoute } from "./utils/notificationNavigation";
import { getConfirmedPushAssociationKey, getPushAssociationKey, PushAssociationQueue, shouldRegisterPushAssociation, withPushAssociationTimeout } from "./utils/pushAssociation";
import { parseDataInvalidation } from "./utils/dataInvalidation";
import type { DataInvalidation } from "./utils/dataInvalidation";

const MAX_AUTOMATIC_REFRESH_RETRIES = 9;

const logParentSession = (
  event: string,
  details: Record<string, string | number | boolean | null> = {},
) => {
  console.info("[PARENT_SESSION]", event, details);
};

const retryDelayFromResponse = async (response: Response): Promise<number | null> => {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.max(0, retryAt - Date.now());
  }

  if (response.status !== 429) return null;
  const body = await parseJsonSafe<{ details?: { resetInSeconds?: unknown } }>(response.clone());
  const resetInSeconds = body?.details?.resetInSeconds;
  return typeof resetInSeconds === "number" && Number.isFinite(resetInSeconds)
    ? Math.max(0, resetInSeconds * 1000)
    : null;
};

const readStoredParentSession = (
  storage: Storage,
  bridge?: ParentSessionSecretBridge,
): {
  accessToken: ParentSessionSecretReadResult;
  refreshState: ParentRefreshStateReadResult;
} => ({
  accessToken: readParentSessionSecret("ecoletrack_token", storage, bridge),
  refreshState: readParentRefreshState(storage, bridge),
});

declare global {
  interface Window {
    onEcoleTrackDataInvalidation?: (event: unknown) => void;
    __pendingDataInvalidations?: unknown[];
  }
}

export default function App() {
  const [initialStoredSession] = useState(() =>
    readStoredParentSession(window.localStorage, window.AndroidSessionBridge),
  );
  const [accessTokenReadResult, setAccessTokenReadResult] = useState(initialStoredSession.accessToken);
  const accessTokenReadRef = useRef<ParentSessionSecretReadResult>(initialStoredSession.accessToken);
  const [token, setToken] = useState<string | null>(
    initialStoredSession.accessToken.status === "available"
      ? initialStoredSession.accessToken.value
      : null,
  );
  const [parent, setParent] = useState<Parent | null>(() => {
    const saved = localStorage.getItem("ecoletrack_parent");
    return saved ? JSON.parse(saved) : null;
  });
  const [fcmToken, setFcmToken] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return window.localStorage.getItem("fcm_token");
  });
  const [refreshStateReadResult, setRefreshStateReadResult] = useState(initialStoredSession.refreshState);
  const refreshStateReadRef = useRef<ParentRefreshStateReadResult>(initialStoredSession.refreshState);
  const initialRefreshState = initialStoredSession.refreshState.status === "available"
    ? initialStoredSession.refreshState.state
    : null;
  const [refreshToken, setRefreshToken] = useState<string | null>(
    initialRefreshState?.refreshToken ?? null,
  );
  const sessionRef = useRef<ParentSessionSnapshot & {
    refreshToken: string | null;
    pendingOperationId: string | null;
  }>({
    accessToken: initialStoredSession.accessToken.status === "available"
      ? initialStoredSession.accessToken.value
      : null,
    refreshToken: initialRefreshState?.refreshToken ?? null,
    pendingOperationId: initialRefreshState?.pendingOperationId ?? null,
    sessionGeneration: 0,
    credentialVersion: 0,
  });
  const [sessionEndedMessage, setSessionEndedMessage] = useState<string | null>(null);
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);
  const refreshRetryTimerRef = useRef<number | null>(null);
  const refreshRetryAttemptRef = useRef(0);
  const storageReadRetryTimerRef = useRef<number | null>(null);
  const storageReadRetryAttemptRef = useRef(0);
  const [storageReadRetryTick, setStorageReadRetryTick] = useState(0);
  const logoutHandledRef = useRef(false);
  const mobileVisitTrackerRef = useRef(new MobileVisitTracker());
  const seenDataInvalidationIdsRef = useRef(new Set<string>());
  const notificationPollInvalidationIdsRef = useRef(new Set<string>());
  const invalidationSessionStartedAtRef = useRef(Date.now());
  const notificationFetchInFlightRef = useRef(false);
  const notificationFetchPendingRef = useRef(false);

  const sessionStorageMessage = (
    accessTokenReadResult.status === "temporarily-unavailable"
    || refreshStateReadResult.status === "temporarily-unavailable"
  )
    ? "Le stockage sécurisé est temporairement indisponible. La session est conservée et une nouvelle lecture sera tentée."
    : (
      accessTokenReadResult.status === "unrecoverable"
      || refreshStateReadResult.status === "unrecoverable"
    )
      ? "Une donnée de session chiffrée est illisible. Elle n'a pas été supprimée automatiquement."
      : refreshStateReadResult.status === "missing" && (token || parent)
        ? "Le jeton de renouvellement est absent. La session locale est conservée jusqu'à confirmation d'une invalidation définitive."
        : null;

  const applyStoredParentSession = (stored: ReturnType<typeof readStoredParentSession>) => {
    const currentSession = sessionRef.current;
    const accessToken = stored.accessToken.status === "available"
      ? stored.accessToken.value
      : stored.accessToken.status === "missing"
        ? null
        : currentSession.accessToken;
    const storedRefreshState = stored.refreshState.status === "available"
      ? stored.refreshState.state
      : stored.refreshState.status === "missing"
        ? null
        : null;
    const refreshTokenValue = storedRefreshState?.refreshToken
      ?? (stored.refreshState.status === "missing" ? null : currentSession.refreshToken);
    const pendingOperationId = storedRefreshState
      ? storedRefreshState.pendingOperationId
      : stored.refreshState.status === "missing"
        ? null
        : currentSession.pendingOperationId;
    const sessionChanged = (
      accessToken !== currentSession.accessToken
      || refreshTokenValue !== currentSession.refreshToken
      || pendingOperationId !== currentSession.pendingOperationId
    );
    sessionRef.current = {
      ...currentSession,
      accessToken,
      refreshToken: refreshTokenValue,
      pendingOperationId,
      sessionGeneration: currentSession.sessionGeneration + (sessionChanged ? 1 : 0),
      credentialVersion: currentSession.credentialVersion + (sessionChanged ? 1 : 0),
    };
    if (sessionChanged) {
      refreshPromiseRef.current = null;
      if (refreshRetryTimerRef.current != null) {
        window.clearTimeout(refreshRetryTimerRef.current);
        refreshRetryTimerRef.current = null;
      }
      refreshRetryAttemptRef.current = 0;
    }

    accessTokenReadRef.current = stored.accessToken;
    setAccessTokenReadResult(stored.accessToken);
    if (stored.accessToken.status === "available") {
      setToken(stored.accessToken.value);
    } else if (stored.accessToken.status === "missing") {
      setToken(null);
    }

    refreshStateReadRef.current = stored.refreshState;
    setRefreshStateReadResult(stored.refreshState);
    if (stored.refreshState.status === "available") {
      setRefreshToken(stored.refreshState.state.refreshToken);
    } else if (stored.refreshState.status === "missing") {
      setRefreshToken(null);
    }

    if (
      stored.accessToken.status !== "temporarily-unavailable"
      && stored.refreshState.status !== "temporarily-unavailable"
    ) {
      storageReadRetryAttemptRef.current = 0;
    }
  };

  const retryStoredParentSessionRead = () => {
    if (
      logoutHandledRef.current
      || (
        accessTokenReadRef.current.status !== "temporarily-unavailable"
        && refreshStateReadRef.current.status !== "temporarily-unavailable"
      )
    ) {
      return;
    }
    const stored = readStoredParentSession(window.localStorage, window.AndroidSessionBridge);
    logParentSession("secure-storage-read", {
      access: stored.accessToken.status,
      refresh: stored.refreshState.status,
    });
    applyStoredParentSession(stored);
  };

  useEffect(() => {
    if (logoutHandledRef.current) {
      if (storageReadRetryTimerRef.current != null) {
        window.clearTimeout(storageReadRetryTimerRef.current);
        storageReadRetryTimerRef.current = null;
      }
      return;
    }

    const storageUnavailable = (
      accessTokenReadResult.status === "temporarily-unavailable"
      || refreshStateReadResult.status === "temporarily-unavailable"
    );
    if (!storageUnavailable) {
      if (storageReadRetryTimerRef.current != null) {
        window.clearTimeout(storageReadRetryTimerRef.current);
        storageReadRetryTimerRef.current = null;
      }
      storageReadRetryAttemptRef.current = 0;
      return;
    }

    const attempt = storageReadRetryAttemptRef.current + 1;
    const delay = Math.min(1000 * (2 ** Math.min(attempt - 1, 6)), 60_000);
    logParentSession("secure-storage-read-retry-scheduled", { attempt, delayMs: delay });
    storageReadRetryTimerRef.current = window.setTimeout(() => {
      storageReadRetryTimerRef.current = null;
      storageReadRetryAttemptRef.current = attempt;
      retryStoredParentSessionRead();
      if (
        accessTokenReadRef.current.status === "temporarily-unavailable"
        || refreshStateReadRef.current.status === "temporarily-unavailable"
      ) {
        setStorageReadRetryTick((value) => value + 1);
      }
    }, delay);

    return () => {
      if (storageReadRetryTimerRef.current != null) {
        window.clearTimeout(storageReadRetryTimerRef.current);
        storageReadRetryTimerRef.current = null;
      }
    };
  }, [accessTokenReadResult.status, refreshStateReadResult.status, storageReadRetryTick]);

  const publishDataInvalidation = (value: unknown, fromNotificationPoll = false) => {
    const invalidation = parseDataInvalidation(value);
    if (!invalidation) return;
    const eventKey = `${invalidation.domain}:${invalidation.eventId}`;

    if (!seenDataInvalidationIdsRef.current.has(eventKey)) {
      seenDataInvalidationIdsRef.current.add(eventKey);
      if (fromNotificationPoll) notificationPollInvalidationIdsRef.current.add(eventKey);
      window.dispatchEvent(new CustomEvent<DataInvalidation>(
        "ecoletrack:data-invalidation",
        { detail: invalidation },
      ));
      if (fromNotificationPoll) notificationPollInvalidationIdsRef.current.delete(eventKey);
    }
    window.AndroidNotificationBridge?.onDataInvalidationReceived?.(eventKey);
  };

  const decodeJwtPayload = (jwt: string): { exp?: number } | null => {
    try {
      const payloadPart = jwt.split(".")[1];
      if (!payloadPart) return null;
      const base64 = payloadPart
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      const padded = base64 + "==".slice((2 - base64.length * 3) & 3);
      const decoded = atob(padded);
      return JSON.parse(decoded) as { exp?: number };
    } catch {
      return null;
    }
  };

  const isTokenExpiringSoon = (tokenToCheck: string) => {
    const payload = decodeJwtPayload(tokenToCheck);
    if (!payload?.exp) return false;
    return Date.now() + 60_000 >= payload.exp;
  };

  const scheduleRefreshRetry = (
    retryDelayMs?: number | null,
    details: { status?: number; code?: string | null; stage?: string } = {},
  ) => {
    if (refreshRetryTimerRef.current != null) return;
    refreshRetryAttemptRef.current = Math.min(
      refreshRetryAttemptRef.current + 1,
      MAX_AUTOMATIC_REFRESH_RETRIES,
    );
    const defaultDelay = Math.min(
      2000 * (2 ** Math.min(refreshRetryAttemptRef.current - 1, 8)),
      5 * 60 * 1000,
    );
    const delay = Math.min(Math.max(retryDelayMs ?? defaultDelay, 1000), 5 * 60 * 1000);
    logParentSession("refresh-retry-scheduled", {
      attempt: refreshRetryAttemptRef.current,
      delayMs: delay,
      status: details.status ?? null,
      code: details.code ?? null,
      stage: details.stage ?? null,
      correlationId: sessionRef.current.pendingOperationId,
      sessionGeneration: sessionRef.current.sessionGeneration,
      credentialVersion: sessionRef.current.credentialVersion,
    });
    refreshRetryTimerRef.current = window.setTimeout(() => {
      refreshRetryTimerRef.current = null;
      if (navigator.onLine && sessionRef.current.refreshToken) void refreshAccessToken();
    }, delay);
  };

  const persistRefreshState = (state: ParentRefreshState) => {
    writeParentRefreshState(state, window.localStorage, window.AndroidSessionBridge);
    const currentSession = sessionRef.current;
    sessionRef.current = {
      ...currentSession,
      refreshToken: state.refreshToken,
      pendingOperationId: state.pendingOperationId,
      credentialVersion: currentSession.credentialVersion
        + (currentSession.refreshToken !== state.refreshToken ? 1 : 0),
    };
    const result: ParentRefreshStateReadResult = { status: "available", state };
    refreshStateReadRef.current = result;
    setRefreshStateReadResult(result);
    setRefreshToken(state.refreshToken);
  };

  const getCurrentSessionSnapshot = (): ParentSessionSnapshot => ({
    accessToken: sessionRef.current.accessToken,
    sessionGeneration: sessionRef.current.sessionGeneration,
    credentialVersion: sessionRef.current.credentialVersion,
  });

  const refreshAccessToken = async (requestCorrelationId?: string): Promise<string | null> => {
    if (logoutHandledRef.current) return null;
    if (refreshPromiseRef.current) {
      logParentSession("refresh-joined-in-flight", {
        requestCorrelationId: requestCorrelationId ?? null,
        correlationId: sessionRef.current.pendingOperationId,
        sessionGeneration: sessionRef.current.sessionGeneration,
        credentialVersion: sessionRef.current.credentialVersion,
      });
      return refreshPromiseRef.current;
    }

    if (refreshRetryTimerRef.current != null) {
      return null;
    }

    const sessionAtStart = sessionRef.current;
    const refreshTokenAtStart = sessionAtStart.refreshToken;
    if (!refreshTokenAtStart) {
      logParentSession("refresh-not-started", {
        storage: refreshStateReadRef.current.status,
        sessionGeneration: sessionAtStart.sessionGeneration,
        credentialVersion: sessionAtStart.credentialVersion,
      });
      return null;
    }

    const requestSessionGeneration = sessionAtStart.sessionGeneration;
    const requestCredentialVersion = sessionAtStart.credentialVersion;
    const refreshPromise = Promise.resolve().then(async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      let operationId: string | null = null;
      let stage = "persist-operation";
      logParentSession("refresh-started", {
        storage: refreshStateReadRef.current.status,
        requestCorrelationId: requestCorrelationId ?? null,
        sessionGeneration: requestSessionGeneration,
        credentialVersion: requestCredentialVersion,
      });
      try {
        const currentSession = sessionRef.current;
        if (
          currentSession.sessionGeneration !== requestSessionGeneration
          || currentSession.credentialVersion !== requestCredentialVersion
          || currentSession.refreshToken !== refreshTokenAtStart
        ) {
          return currentSession.sessionGeneration === requestSessionGeneration
            ? currentSession.accessToken
            : null;
        }
        const operationIdForRequest = currentSession.pendingOperationId ?? createParentSessionCorrelationId();
        operationId = operationIdForRequest;
        persistRefreshState({ refreshToken: refreshTokenAtStart, pendingOperationId: operationIdForRequest });
        logParentSession("refresh-operation", {
          correlationId: operationIdForRequest,
          requestCorrelationId: requestCorrelationId ?? null,
          sessionGeneration: requestSessionGeneration,
          credentialVersion: requestCredentialVersion,
        });
        stage = "request";
        const response = await fetch(withApiBase("/api/mobile/parent/refresh-token"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ refreshToken: refreshTokenAtStart, operationId: operationIdForRequest }),
          signal: controller.signal,
        });
        let currentSession = sessionRef.current;
        if (requestSessionGeneration !== currentSession.sessionGeneration) return null;

        if (!response.ok) {
          const code = await getParentAuthErrorCode(response);
          currentSession = sessionRef.current;
          logParentSession("refresh-response", {
            status: response.status,
            code,
            correlationId: operationId,
            requestCorrelationId: requestCorrelationId ?? null,
            sessionGeneration: requestSessionGeneration,
            credentialVersion: currentSession.credentialVersion,
          });
          if (response.status === 401 && isDefinitiveParentSessionError(code)) {
            const disabledMessage = await getDisabledParentMessage(response);
            currentSession = sessionRef.current;
            if (currentSession.sessionGeneration !== requestSessionGeneration) return null;
            const rejectionIsCurrent = (
              currentSession.credentialVersion === requestCredentialVersion
              && currentSession.refreshToken === refreshTokenAtStart
            );
            if (code === "ACCOUNT_DISABLED" || rejectionIsCurrent) {
              handleLogout(
                disabledMessage ?? (code === "ACCOUNT_DISABLED"
                  ? "Ce compte est désactivé."
                  : "La session mobile a été invalidée."),
                "definitive",
                code,
              );
            } else {
              logParentSession("refresh-response-stale", {
                correlationId: operationId,
                requestCorrelationId: requestCorrelationId ?? null,
                sessionGeneration: requestSessionGeneration,
                credentialVersion: currentSession.credentialVersion,
                code,
              });
              return currentSession.accessToken;
            }
          } else {
            const retryDelay = await retryDelayFromResponse(response);
            currentSession = sessionRef.current;
            if (currentSession.sessionGeneration !== requestSessionGeneration) return null;
            if (
              currentSession.credentialVersion !== requestCredentialVersion
              || currentSession.refreshToken !== refreshTokenAtStart
            ) {
              return currentSession.accessToken;
            }
            scheduleRefreshRetry(retryDelay, {
              status: response.status,
              code,
              stage: "http-response",
            });
          }
          return null;
        }

        stage = "parse-response";
        const data = await parseJsonSafe<{ accessToken?: string; refreshToken?: string }>(response);
        currentSession = sessionRef.current;
        if (requestSessionGeneration !== currentSession.sessionGeneration) return null;
        if (
          currentSession.credentialVersion !== requestCredentialVersion
          || currentSession.refreshToken !== refreshTokenAtStart
        ) {
          logParentSession("refresh-success-stale", {
            correlationId: operationId,
            requestCorrelationId: requestCorrelationId ?? null,
            sessionGeneration: requestSessionGeneration,
            credentialVersion: currentSession.credentialVersion,
          });
          return currentSession.accessToken;
        }
        if (!data?.accessToken || !data?.refreshToken) {
          logParentSession("refresh-response-invalid", {
            status: response.status,
            correlationId: operationId,
            requestCorrelationId: requestCorrelationId ?? null,
            sessionGeneration: requestSessionGeneration,
            credentialVersion: requestCredentialVersion,
          });
          scheduleRefreshRetry(null, { status: response.status, stage });
          return null;
        }

        stage = "persist-rotated-refresh-state";
        persistRefreshState({ refreshToken: data.refreshToken, pendingOperationId: null });
        sessionRef.current = { ...sessionRef.current, accessToken: data.accessToken };
        setToken(data.accessToken);
        stage = "persist-access-token";
        writeParentSessionSecret("ecoletrack_token", data.accessToken, window.localStorage, window.AndroidSessionBridge);
        refreshRetryAttemptRef.current = 0;
        if (refreshRetryTimerRef.current != null) {
          window.clearTimeout(refreshRetryTimerRef.current);
          refreshRetryTimerRef.current = null;
        }
        const accessResult: ParentSessionSecretReadResult = {
          status: "available",
          value: data.accessToken,
        };
        accessTokenReadRef.current = accessResult;
        setAccessTokenReadResult(accessResult);
        logParentSession("refresh-succeeded", {
          status: response.status,
          correlationId: operationId,
          requestCorrelationId: requestCorrelationId ?? null,
          sessionGeneration: requestSessionGeneration,
          credentialVersion: sessionRef.current.credentialVersion,
        });

        return data.accessToken;
      } catch (error) {
        const currentSession = sessionRef.current;
        if (requestSessionGeneration !== currentSession.sessionGeneration) return null;
        if (
          currentSession.credentialVersion !== requestCredentialVersion
          || currentSession.refreshToken !== refreshTokenAtStart
        ) {
          logParentSession("refresh-failed-after-session-advance", {
            correlationId: operationId ?? null,
            requestCorrelationId: requestCorrelationId ?? null,
            sessionGeneration: requestSessionGeneration,
            credentialVersion: currentSession.credentialVersion,
            stage,
          });
          return currentSession.accessToken;
        }
        const timeoutOccurred = error instanceof DOMException && error.name === "AbortError";
        logParentSession("refresh-failed", {
          reason: timeoutOccurred ? "timeout" : "network-or-storage",
          stage,
          correlationId: operationId ?? null,
          requestCorrelationId: requestCorrelationId ?? null,
          sessionGeneration: requestSessionGeneration,
          credentialVersion: requestCredentialVersion,
        });
        scheduleRefreshRetry(null, { stage });
        return null;
      } finally {
        window.clearTimeout(timeout);
        if (requestSessionGeneration === sessionRef.current.sessionGeneration) {
          refreshPromiseRef.current = null;
        }
      }
    });

    refreshPromiseRef.current = refreshPromise;
    return refreshPromise;
  };

  const ensureValidAccessToken = async (requestCorrelationId?: string): Promise<string | null> => {
    if (logoutHandledRef.current) return null;
    const currentSession = sessionRef.current;
    if (!currentSession.refreshToken) {
      return currentSession.accessToken && !isTokenExpiringSoon(currentSession.accessToken)
        ? currentSession.accessToken
        : null;
    }

    if (!currentSession.accessToken || isTokenExpiringSoon(currentSession.accessToken)) {
      return await refreshAccessToken(requestCorrelationId);
    }

    return currentSession.accessToken;
  };

  const performProtectedRequest = async (requestFactory: (authToken: string) => Promise<Response>) => {
    const correlationId = createParentSessionCorrelationId();
    const initialSnapshot = getCurrentSessionSnapshot();
    let authToken = await ensureValidAccessToken(correlationId);
    if (!authToken) return null;

    try {
      return await performParentProtectedRequest({
        correlationId,
        initialSnapshot,
        initialToken: authToken,
        requestFactory,
        getCurrentSnapshot: getCurrentSessionSnapshot,
        refreshAccessToken,
        onSessionExpired: (message, code) => handleLogout(message, "definitive", code),
        log: logParentSession,
      });
    } catch {
      logParentSession("protected-request-failed", {
        reason: "network",
        sessionGeneration: initialSnapshot.sessionGeneration,
        credentialVersion: initialSnapshot.credentialVersion,
      });
      return null;
    }
  };

  const recordMobileVisit = async () => {
    const response = await performProtectedRequest((authToken) => fetch(withApiBase("/api/mobile/parent/visit"), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json"
      }
    }));

    if (!response?.ok) {
      throw new Error(`Mobile visit recording failed with status ${response?.status ?? "no response"}.`);
    }
  };

  useEffect(() => {
    const parentId = parent?.id ? String(parent.id) : null;
    mobileVisitTrackerRef.current.setAuthenticatedParent(token && parentId ? parentId : null);
    if (!token || !parentId) return;

    void mobileVisitTrackerRef.current.recordAppOpen(parentId, recordMobileVisit).catch(() => {
      console.error("[VISIT] Failed to record authenticated app opening.");
    });
  }, [token, parent?.id]);

  useEffect(() => {
    const parentId = token && parent?.id ? String(parent.id) : null;
    const resumeRefreshRecovery = () => {
      retryStoredParentSessionRead();
      void ensureValidAccessToken();
    };

    const handleAppResume = () => {
      resumeRefreshRecovery();
      if (!parentId) return;
      void mobileVisitTrackerRef.current.recordForegroundReturn(parentId, recordMobileVisit).catch(() => {
        console.error("[VISIT] Failed to record foreground return.");
      });
    };
    const handleAppBackground = () => {
      if (parentId) mobileVisitTrackerRef.current.markBackgrounded(parentId);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleAppResume();
      } else if (parentId) {
        mobileVisitTrackerRef.current.markBackgrounded(parentId);
      }
    };
    const handlePageShow = () => {
      handleAppResume();
    };
    const handlePageHide = () => {
      if (parentId) mobileVisitTrackerRef.current.markBackgrounded(parentId);
    };
    const handleWindowFocus = () => {
      handleAppResume();
    };
    const handleNetworkOnline = () => {
      handleAppResume();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("ecoletrack:app-resume", handleAppResume);
    window.addEventListener("ecoletrack:app-background", handleAppBackground);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("online", handleNetworkOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("ecoletrack:app-resume", handleAppResume);
      window.removeEventListener("ecoletrack:app-background", handleAppBackground);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("online", handleNetworkOnline);
    };
  }, [token, parent, refreshToken]);

  useEffect(() => {
    if (refreshToken && !token) {
      void refreshAccessToken();
    }
  }, [refreshToken, token]);

  const [activeTab, setActiveTab] = useState("children");
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [children, setChildren] = useState<Child[]>([]);

  const [notificationTarget, setNotificationTarget] = useState<string | null>(null);
  const [notificationTargetSignal, setNotificationTargetSignal] = useState(0);
  const [notificationDispatchId, setNotificationDispatchId] = useState<string | null>(null);
  const [notificationAlertMenu, setNotificationAlertMenu] = useState<"notes" | "homework" | "absences" | "info" | null>(null);
  const notificationBridgeSessionIdRef = useRef<string | null>(null);
  if (notificationBridgeSessionIdRef.current === null) {
    notificationBridgeSessionIdRef.current = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `notification-bridge-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  const latestNotificationDispatchIdRef = useRef<string | null>(null);
  const acknowledgedNotificationDispatchIdRef = useRef<string | null>(null);
  const lastRegisteredPushAssociationRef = useRef<string | null>(null);
  const registeringPushAssociationRef = useRef<string | null>(null);
  const pushSessionGenerationRef = useRef(0);
  const activePushAssociationRef = useRef<string | null>(null);
  const pushAssociationQueueRef = useRef<PushAssociationQueue | null>(null);
  if (pushAssociationQueueRef.current === null) {
    pushAssociationQueueRef.current = new PushAssociationQueue();
  }
  const deviceIdRef = useRef<string | null>(null);

  const getDeviceId = () => {
    if (deviceIdRef.current) {
      return deviceIdRef.current;
    }

    if (typeof window === "undefined") {
      return null;
    }

    const storageKey = "ecoletrack_device_id";
    let deviceId = window.localStorage.getItem(storageKey);
    if (!deviceId) {
      deviceId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `device-${Math.random().toString(36).slice(2)}-${Date.now()}`;
      window.localStorage.setItem(storageKey, deviceId);
    }

    deviceIdRef.current = deviceId;
    return deviceId;
  };

  useEffect(() => {
    const runtime = window as Window & typeof globalThis & {
      setFcmToken?: (token: string) => void;
      setNotificationTarget?: (target: string, dispatchId: string | null) => void;
      onEcoleTrackDataInvalidation?: (event: unknown) => void;
    };

    runtime.setFcmToken = (token: string) => {
      setFcmToken(token);
      window.localStorage.setItem("fcm_token", token);
    };

    runtime.setNotificationTarget = (target: string, dispatchId: string | null) => {
      latestNotificationDispatchIdRef.current = dispatchId;
      setNotificationTarget(target);
      setNotificationDispatchId(dispatchId);
      setNotificationTargetSignal((prev) => prev + 1);
    };
    runtime.onEcoleTrackDataInvalidation = publishDataInvalidation;

    const pendingDataInvalidations = window.__pendingDataInvalidations ?? [];
    delete window.__pendingDataInvalidations;
    pendingDataInvalidations.forEach(publishDataInvalidation);

    const pendingTarget = (window as any).__pendingNotificationTarget;
    if (pendingTarget && typeof pendingTarget === "string" && pendingTarget.trim().length > 0) {
      const pendingContext = (window as any).__pendingNotificationContext;
      const pendingDispatchId = typeof pendingContext?.dispatchId === "string"
        ? pendingContext.dispatchId
        : null;
      runtime.setNotificationTarget(pendingTarget, pendingDispatchId);
      delete (window as any).__pendingNotificationTarget;
      delete (window as any).__pendingNotificationContext;
    }

    const bridgeSessionId = notificationBridgeSessionIdRef.current;
    if (bridgeSessionId) {
      window.AndroidNotificationBridge?.onNotificationBridgeReady?.(bridgeSessionId);
    }

    return () => {
      delete runtime.setFcmToken;
      delete runtime.setNotificationTarget;
      delete runtime.onEcoleTrackDataInvalidation;
    };
  }, []);

  useEffect(() => {
    if (!notificationTarget || notificationTargetSignal === 0) {
      return;
    }

    const route = getNotificationNavigationRoute(notificationTarget);
    if (!route) {
      return;
    }

    if (route.tab === "notes") {
      if (!selectedChild && children.length > 0) {
        setSelectedChild(children[0]);
      }
    }
    setActiveTab(route.tab);
    setNotificationAlertMenu(route.alertMenu);
  }, [notificationTarget, notificationTargetSignal, children, selectedChild]);

  useEffect(() => {
    if (!notificationTarget || !notificationDispatchId || notificationTargetSignal === 0) {
      return;
    }

    const expectedRoute = getNotificationNavigationRoute(notificationTarget);
    if (expectedRoute
        && (activeTab !== expectedRoute.tab || notificationAlertMenu !== expectedRoute.alertMenu)) {
      return;
    }

    if (acknowledgedNotificationDispatchIdRef.current === notificationDispatchId) {
      return;
    }

    const acknowledgeAfterRender = () => {
      if (latestNotificationDispatchIdRef.current !== notificationDispatchId
          || acknowledgedNotificationDispatchIdRef.current === notificationDispatchId) {
        return;
      }

      const notificationBridge = window.AndroidNotificationBridge;
      const bridgeSessionId = notificationBridgeSessionIdRef.current;
      if (typeof notificationBridge?.onNotificationTargetReceived !== "function"
          || !bridgeSessionId) {
        return;
      }

      acknowledgedNotificationDispatchIdRef.current = notificationDispatchId;
      notificationBridge.onNotificationTargetReceived(notificationDispatchId, bridgeSessionId);
    };

    const frameId = window.requestAnimationFrame(acknowledgeAfterRender);
    return () => window.cancelAnimationFrame(frameId);
  }, [
    activeTab,
    notificationAlertMenu,
    notificationDispatchId,
    notificationTarget,
    notificationTargetSignal,
  ]);

  useEffect(() => {
    const pushToken = fcmToken;
    if (!token || !parent?.id || !pushToken) {
      activePushAssociationRef.current = null;
      return;
    }

    const deviceId = getDeviceId();
    const associationKey = getPushAssociationKey(parent.id, deviceId, pushToken);
    if (!associationKey) {
      activePushAssociationRef.current = null;
      return;
    }

    activePushAssociationRef.current = associationKey;
    const sessionGeneration = pushSessionGenerationRef.current;
    const registrationAttemptKey = JSON.stringify([sessionGeneration, associationKey]);
    if (!shouldRegisterPushAssociation(
      associationKey,
      lastRegisteredPushAssociationRef.current,
      registeringPushAssociationRef.current,
    )) {
      return;
    }

    registeringPushAssociationRef.current = registrationAttemptKey;

    const registration = pushAssociationQueueRef.current.enqueue(async () => {
      if (activePushAssociationRef.current !== associationKey
        || pushSessionGenerationRef.current !== sessionGeneration) {
        return false;
      }

      return tryRegisterPushTokenWithBackoff(pushToken, () =>
        activePushAssociationRef.current === associationKey
        && pushSessionGenerationRef.current === sessionGeneration
      );
    });

    void registration
      .then((success) => {
        const confirmedKey = getConfirmedPushAssociationKey(
          success,
          associationKey,
          activePushAssociationRef.current,
          pushSessionGenerationRef.current === sessionGeneration,
        );
        if (confirmedKey) lastRegisteredPushAssociationRef.current = confirmedKey;
      })
      .catch(() => {
        console.error("[FCM] Push-token registration failed.");
      })
      .finally(() => {
        if (registeringPushAssociationRef.current === registrationAttemptKey) {
          registeringPushAssociationRef.current = null;
        }
      });
  }, [token, fcmToken, parent?.id]);

  const isMobileProductionMode = (() => {
    const envFlag = (import.meta as any)?.env?.VITE_MOBILE_PRODUCTION === "true";
    const isAndroidWebViewHost = typeof window !== "undefined" && (
      window.location.host === "appassets.androidplatform.net" ||
      window.location.href.startsWith("file:///android_asset/") ||
      window.location.href.includes("/android_asset/")
    );
    const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const isMobileQueryMode = searchParams?.get("mobile") === "1" || searchParams?.get("mode") === "mobile" || searchParams?.get("mode") === "production";
    const isStoredMobileMode = typeof window !== "undefined" && window.localStorage.getItem("ecoletrack_mobile_production") === "true";
    return envFlag || isAndroidWebViewHost || isMobileQueryMode || isStoredMobileMode;
  })();

  // Notifications loaded from Express
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const registerPushToken = async (pushToken: string): Promise<{ success: boolean; status?: number; retryable: boolean }> => {
    const deviceId = getDeviceId();
    if (!deviceId) {
      console.error("[FCM] Impossible de générer un deviceId");
      return { success: false, retryable: false };
    }

    try {
      const response = await withPushAssociationTimeout((signal) =>
        performProtectedRequest((authToken) => fetch(withApiBase("/api/mobile/parent/devices/register-push-token"), {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${authToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ pushToken, platform: "android", appVersion: "1.0.0", deviceId }),
          signal
        }))
      );

      if (!response) {
        // performProtectedRequest returned null (likely auth refresh failed)
        return { success: false, retryable: false };
      }

      if (response.status === 403) {
        return { success: false, status: 403, retryable: false };
      }

      // Retryable server errors
      if ([500, 502, 503, 504].includes(response.status)) {
        return { success: false, status: response.status, retryable: true };
      }

      // Non-retryable client errors
      if ([400, 401, 404, 422].includes(response.status)) {
        return { success: false, status: response.status, retryable: false };
      }

      // Otherwise success if ok
      return { success: response.ok, status: response.status, retryable: false };
    } catch {
      console.error("[FCM] Push-token registration request failed.");
      // network / fetch exception -> retryable
      return { success: false, retryable: true };
    }
  };

  const tryRegisterPushTokenWithBackoff = async (pushToken: string, shouldContinue: () => boolean = () => true) => {
    const MAX_ATTEMPTS = 5;
    const BASE_DELAY_MS = 1000;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (!shouldContinue()) return false;
      try {
        const result = await registerPushToken(pushToken);
        if (result.success) return true;
        if (!result.retryable) return false;
      } catch (e) {
        // defensive: treat unexpected throws as retryable
      }

      if (attempt === MAX_ATTEMPTS) break;
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    return false;
  };
  // Fetch parent in-app notifications
  const fetchNotifications = async (activeToken?: string) => {
    if (notificationFetchInFlightRef.current) {
      notificationFetchPendingRef.current = true;
      return;
    }

    notificationFetchInFlightRef.current = true;
    const requestSessionGeneration = pushSessionGenerationRef.current;
    try {
      const response = await performProtectedRequest((authToken) => fetch(withApiBase("/api/mobile/parent/notifications"), {
        headers: { "Authorization": `Bearer ${authToken}` }
      }));
      if (requestSessionGeneration !== pushSessionGenerationRef.current) return;

      if (!response) {
        return;
      }

      if (response.status === 403) {
        notificationFetchPendingRef.current = false;
        setNotifications([]);
        return;
      }

      if (response.ok) {
        const data = await parseJsonSafe<AppNotification[]>(response.clone());
        const mapped = Array.isArray(data) ? data : [];
        const publishNotificationInvalidation = (notification: AppNotification) => {
          const eventId = notification.dataInvalidationId;
          const domain = notification.dataInvalidationDomain;
          if (!eventId || !domain) return;
          if (Date.parse(notification.createdAt) >= invalidationSessionStartedAtRef.current) {
            publishDataInvalidation({
              domain,
              eventId,
              entityIds: notification.dataInvalidationEntityIds,
            }, true);
          } else {
            seenDataInvalidationIdsRef.current.add(`${domain}:${eventId}`);
          }
        };
        mapped.forEach(publishNotificationInvalidation);
        setNotifications(mapped);
      }
    } finally {
      notificationFetchInFlightRef.current = false;
      if (notificationFetchPendingRef.current && token) {
        notificationFetchPendingRef.current = false;
        void fetchNotifications(activeToken);
      }
    }
  };

  // Poll for background notifications regularly when logged in.
  useEffect(() => {
    if (!token) return;

    let refreshTimer: number | undefined;
    const refreshNotificationsAfterInvalidation = (event: Event) => {
      const invalidation = event instanceof CustomEvent ? parseDataInvalidation(event.detail) : null;
      if (!invalidation
        || notificationPollInvalidationIdsRef.current.has(`${invalidation.domain}:${invalidation.eventId}`)) return;
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined;
        void fetchNotifications();
      }, 120);
    };
    const refreshNotificationsOnResume = () => {
      void fetchNotifications();
    };
    window.addEventListener("ecoletrack:data-invalidation", refreshNotificationsAfterInvalidation);
    window.addEventListener("ecoletrack:app-resume", refreshNotificationsOnResume);
    window.addEventListener("online", refreshNotificationsOnResume);
    fetchNotifications();
    const interval = setInterval(() => {
      fetchNotifications();
    }, 3000);
    return () => {
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      window.removeEventListener("ecoletrack:data-invalidation", refreshNotificationsAfterInvalidation);
      window.removeEventListener("ecoletrack:app-resume", refreshNotificationsOnResume);
      window.removeEventListener("online", refreshNotificationsOnResume);
      clearInterval(interval);
    };
  }, [token]);

  // Handlers for session authentication
  const handleLoginSuccess = (newToken: string, newParent: Parent, newRefreshToken: string) => {
    const currentSession = sessionRef.current;
    sessionRef.current = {
      ...currentSession,
      accessToken: newToken,
      refreshToken: newRefreshToken,
      pendingOperationId: null,
      sessionGeneration: currentSession.sessionGeneration + 1,
      credentialVersion: currentSession.credentialVersion + 1,
    };
    refreshPromiseRef.current = null;
    if (refreshRetryTimerRef.current != null) {
      window.clearTimeout(refreshRetryTimerRef.current);
      refreshRetryTimerRef.current = null;
    }
    if (storageReadRetryTimerRef.current != null) {
      window.clearTimeout(storageReadRetryTimerRef.current);
      storageReadRetryTimerRef.current = null;
    }
    refreshRetryAttemptRef.current = 0;
    storageReadRetryAttemptRef.current = 0;
    setSessionEndedMessage(null);
    seenDataInvalidationIdsRef.current.clear();
    notificationPollInvalidationIdsRef.current.clear();
    invalidationSessionStartedAtRef.current = Date.now();
    notificationFetchPendingRef.current = false;
    window.__pendingDataInvalidations = [];
    window.AndroidNotificationBridge?.clearPendingDataInvalidations?.();
    pushSessionGenerationRef.current += 1;
    activePushAssociationRef.current = getPushAssociationKey(newParent.id, deviceIdRef.current, fcmToken);
    persistRefreshState({ refreshToken: newRefreshToken, pendingOperationId: null });
    writeParentSessionSecret("ecoletrack_token", newToken, window.localStorage, window.AndroidSessionBridge);
    const accessResult: ParentSessionSecretReadResult = { status: "available", value: newToken };
    accessTokenReadRef.current = accessResult;
    setAccessTokenReadResult(accessResult);
    localStorage.setItem("ecoletrack_parent", JSON.stringify(newParent));
    logoutHandledRef.current = false;
    setToken(newToken);
    setParent(newParent);
    if (!notificationTarget || notificationTargetSignal === 0) {
      setActiveTab("children");
    }
    setSelectedChild(null);
    fetchNotifications(newToken);
  };

  const handleLogout = (
    message?: string,
    reason?: ParentLogoutReason,
    code?: string | null,
  ) => {
    if (reason === "manual") setSessionEndedMessage(null);
    if (message) setSessionEndedMessage(message);
    if (logoutHandledRef.current) return;
    logoutHandledRef.current = true;
    const currentSession = sessionRef.current;
    const currentToken = currentSession.accessToken;
    const currentRefreshToken = currentSession.refreshToken;
    const currentFcmToken = fcmToken ?? (typeof window !== "undefined" ? window.localStorage.getItem("fcm_token") : null);
    const currentDeviceId = typeof window !== "undefined" ? window.localStorage.getItem("ecoletrack_device_id") : null;

    try {
      clearPersistedParentSession(localStorage, window.AndroidSessionBridge);
    } catch {
      if (reason === "manual") {
        let sessionRestored = true;
        if (currentToken) {
          try {
            writeParentSessionSecret("ecoletrack_token", currentToken, window.localStorage, window.AndroidSessionBridge);
          } catch {
            sessionRestored = false;
          }
        }
        if (currentRefreshToken) {
          try {
            writeParentRefreshState(
              {
                refreshToken: currentRefreshToken,
                pendingOperationId: currentSession.pendingOperationId,
              },
              window.localStorage,
              window.AndroidSessionBridge,
            );
          } catch {
            sessionRestored = false;
          }
        }
        if (parent) {
          try {
            localStorage.setItem("ecoletrack_parent", JSON.stringify(parent));
          } catch {
            sessionRestored = false;
          }
        }
        logParentSession("secure-storage-clear-failed", {
          reason,
          code: code ?? null,
          sessionRestored,
        });
        logoutHandledRef.current = false;
        setSessionEndedMessage("La déconnexion sécurisée n'a pas abouti. La session reste ouverte; réessayez avant de fermer l'application.");
        return;
      }
      logParentSession("secure-storage-clear-failed", { reason: reason ?? "unspecified", code: code ?? null });
    }

    sessionRef.current = {
      accessToken: null,
      refreshToken: null,
      pendingOperationId: null,
      sessionGeneration: currentSession.sessionGeneration + 1,
      credentialVersion: currentSession.credentialVersion + 1,
    };
    refreshPromiseRef.current = null;
    logParentSession("session-logout", {
      reason: reason ?? "local",
      code: code ?? null,
      sessionGeneration: currentSession.sessionGeneration,
      credentialVersion: currentSession.credentialVersion,
    });
    if (storageReadRetryTimerRef.current != null) {
      window.clearTimeout(storageReadRetryTimerRef.current);
      storageReadRetryTimerRef.current = null;
    }
    pushSessionGenerationRef.current += 1;
    activePushAssociationRef.current = null;
    lastRegisteredPushAssociationRef.current = null;
    seenDataInvalidationIdsRef.current.clear();
    notificationPollInvalidationIdsRef.current.clear();
    invalidationSessionStartedAtRef.current = Date.now();
    notificationFetchPendingRef.current = false;
    window.__pendingDataInvalidations = [];
    window.AndroidNotificationBridge?.clearPendingDataInvalidations?.();

    if (refreshRetryTimerRef.current != null) {
      window.clearTimeout(refreshRetryTimerRef.current);
      refreshRetryTimerRef.current = null;
    }
    setToken(null);
    setRefreshToken(null);
    refreshPromiseRef.current = null;
    setParent(null);
    setNotifications([]);
    setSelectedChild(null);

    if (reason !== "manual" || !currentToken || !currentRefreshToken) {
      if (reason === "manual" && (!currentToken || !currentRefreshToken)) {
        logParentSession("manual-logout-session-revocation-skipped", {
          accessTokenAvailable: Boolean(currentToken),
          refreshTokenAvailable: Boolean(currentRefreshToken),
        });
      }
      return;
    }

    const logoutPayload: Record<string, string> = {};
    logoutPayload.refreshToken = currentRefreshToken;
    if (currentFcmToken) {
      logoutPayload.pushToken = currentFcmToken;
    }
    if (currentDeviceId) {
      logoutPayload.deviceId = currentDeviceId;
    }

    const logoutRequest = pushAssociationQueueRef.current.enqueue(async () => {
      const response = await withPushAssociationTimeout((signal) => fetch(withApiBase("/api/mobile/parent/logout"), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${currentToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(logoutPayload),
        signal
      }));
      if (!response.ok) {
        logParentSession("manual-logout-server-rejected", { status: response.status });
        return;
      }
    });

    void logoutRequest.catch(() => {
      logParentSession("manual-logout-server-unavailable");
    });
  };

  // Deep link push click handling
  const handleNotificationClick = (notif: AppNotification) => {
    if (!token) return;
    setActiveTab("notifications");
    setSelectedChild(null);
    // Mark specifically as read
    fetchNotifications();
  };

  // System restart button cycle
  const handlePowerCycle = () => {
    setSelectedChild(null);
    setActiveTab("children");
  };

  const unreadPushCount = notifications.filter(n => !n.read).length;

  if (isMobileProductionMode) {
    return (
      <div className="h-screen overflow-hidden theme-bg flex flex-col" id="ecoletrack-mobile-production">
        <ParentPortal
          token={token}
          parent={parent}
          onLoginSuccess={handleLoginSuccess}
          onLogout={handleLogout}
          sessionEndedMessage={sessionEndedMessage}
          sessionStorageMessage={sessionStorageMessage}
          refreshAccessToken={refreshAccessToken}
          getCurrentSessionSnapshot={getCurrentSessionSnapshot}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          selectedChild={selectedChild}
          setSelectedChild={setSelectedChild}
          notifications={notifications}
          fetchNotifications={fetchNotifications}
          notificationAlertMenu={notificationAlertMenu}
          notificationDispatchId={notificationDispatchId}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen theme-bg flex flex-col font-sans" id="ecoletrack-workspace">
      
      {/* Upper Navigation banner */}
      <header className="theme-panel border-b theme-border px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-indigo-600/20">
            ÉT
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-white flex items-center gap-2">
              Ecoles Track Workspace
              <span className="text-[10px] bg-indigo-950 text-indigo-400 border border-indigo-800 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                Fullstack SDK
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">Auditeur d&apos;orchestration multi-canal & Émulateur Android Parent</p>
          </div>
        </div>

        {/* Health State badge */}
        <div className="flex items-center gap-2 theme-panel theme-border px-3 py-1.5 rounded-xl">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-bold theme-muted font-mono">Backend: PORT 3001 (Vite + Express)</span>
        </div>
        <ThemeToggle />
      </header>

      {/* Main workspace layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-y-auto lg:min-h-0">
        
        {/* COLUMN 1: SETUP DOCUMENTATION GUIDE (4 cols) */}
        <div className="lg:col-span-4 theme-card border theme-border rounded-2xl p-5 overflow-y-auto flex flex-col justify-between h-auto lg:h-full">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-indigo-400 border-b border-slate-800 pb-2.5">
              <BookOpen className="h-4.5 w-4.5 shrink-0" />
              <h2 className="text-xs font-bold uppercase tracking-wider">Documentation & Architecture</h2>
            </div>

            <div className="space-y-3.5 text-xs text-slate-300 font-medium">
              <section className="bg-slate-950 p-3 rounded-xl border border-slate-900">
                <h3 className="font-bold text-slate-200 flex items-center gap-1.5 mb-1 text-[11px]">
                  <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" />
                  Sécurité Parent-Only Strict
                </h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  L&apos;authentification est protégée par un double filtre backend (<code className="text-indigo-300 font-mono">requireAuth</code> + <code className="text-indigo-300 font-mono">requireParentRoleOnly</code>). Les rôles Enseignant ou Directeur sont bloqués avec un statut <span className="text-rose-400 font-bold">403 Interdit</span>. Un parent ne peut lire que ses enfants rattachés.
                </p>
              </section>

              <section className="bg-slate-950 p-3 rounded-xl border border-slate-900">
                <h3 className="font-bold text-slate-200 flex items-center gap-1.5 mb-1 text-[11px]">
                  <Code className="h-3.5 w-3.5 text-emerald-400" />
                  Orchestrateur Multi-Canal
                </h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  1. <strong>Push FCM :</strong> Envoyé en priorité si activé.<br />
                  2. <strong>WhatsApp :</strong> Gabarit transmis si Push échoue et opt-in actif.<br />
                  3. <strong>SMS :</strong> SMS de secours envoyé si WhatsApp échoue/désactivé et opt-in actif.<br />
                  * Clé d&apos;idempotence unique pour éliminer tout doublon.
                </p>
              </section>

              <section className="theme-card p-3 rounded-xl border theme-border">
                <h3 className="font-bold theme-text mb-1 text-[11px] flex items-center gap-1.5">
                  <Terminal className="h-3.5 w-3.5 text-amber-400" />
                  Commandes de Build (Android)
                </h3>
                <p className="text-[10px] text-slate-400 font-mono space-y-1 mt-1 bg-slate-900 p-2 rounded border border-slate-800">
                  # Build Debug APK<br />
                  cd android && ./gradlew assembleDebug<br />
                  <br />
                  # Build Release signée (AAB/APK)<br />
                  ./gradlew assembleRelease
                </p>
              </section>
            </div>
          </div>

          {/* Quick instructions inside footer */}
          <div className="pt-4 border-t border-slate-850 text-[11px] text-slate-500 leading-relaxed mt-4 lg:mt-0">
            <span className="font-bold text-slate-400 block mb-1">💡 Comment Tester :</span>
            1. Connectez-vous sur le téléphone avec <strong>Jean Dupont</strong>.<br />
            2. À droite, générez une absence pour son fils <strong>Lucas</strong>.<br />
            3. Observez l&apos;orchestrateur de logs à droite et la notification sur le téléphone !
          </div>
        </div>

        {/* COLUMN 2: ANDROID SMARTPHONE EMULATOR (4 cols) */}
        <div className="lg:col-span-4">
          <ParentPortal
            token={token}
            parent={parent}
            onLoginSuccess={handleLoginSuccess}
            onLogout={handleLogout}
            sessionEndedMessage={sessionEndedMessage}
            sessionStorageMessage={sessionStorageMessage}
            refreshAccessToken={refreshAccessToken}
            getCurrentSessionSnapshot={getCurrentSessionSnapshot}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            selectedChild={selectedChild}
            setSelectedChild={setSelectedChild}
            notifications={notifications}
            fetchNotifications={fetchNotifications}
            notificationAlertMenu={notificationAlertMenu}
            notificationDispatchId={notificationDispatchId}
          />
        </div>



      </div>
    </div>
  );
}
