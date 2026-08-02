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
    setNotificationTarget?: (target: string) => void;
  }
}
import ParentPortal from "./components/ParentPortal";
import DeveloperConsole from "./components/DeveloperConsole";
import ThemeToggle from "./components/ThemeToggle";
import { Parent, Child, AppNotification, CompleteDeliveryLog } from "./types";
import { parseJsonSafe, withApiBase } from "./utils/http";

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("ecoletrack_token"));
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
  const [refreshToken, setRefreshToken] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return window.localStorage.getItem("ecoletrack_refresh_token");
  });
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

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

  const refreshAccessToken = async (): Promise<string | null> => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    if (!refreshToken) {
      return null;
    }

    const promise = (async () => {
      try {
        const response = await fetch(withApiBase("/api/mobile/parent/refresh-token"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ refreshToken })
        });

        if (!response.ok) {
          return null;
        }

        const data = await parseJsonSafe<{ accessToken?: string; refreshToken?: string }>(response);
        if (!data?.accessToken || !data?.refreshToken) {
          return null;
        }

        window.localStorage.setItem("ecoletrack_token", data.accessToken);
        window.localStorage.setItem("ecoletrack_refresh_token", data.refreshToken);
        setToken(data.accessToken);
        setRefreshToken(data.refreshToken);

        return data.accessToken;
      } catch {
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = promise;
    return promise;
  };

  const ensureValidAccessToken = async (): Promise<string | null> => {
    if (!refreshToken) {
      return token;
    }

    if (!token || isTokenExpiringSoon(token)) {
      return await refreshAccessToken();
    }

    return token;
  };

  const performProtectedRequest = async (requestFactory: (authToken: string) => Promise<Response>) => {
    let authToken = token;
    if (!authToken) {
      authToken = await refreshAccessToken();
      if (!authToken) {
        return null;
      }
    }

    try {
      let response = await requestFactory(authToken);
      if (response.status === 401) {
        const refreshedToken = await refreshAccessToken();
        if (refreshedToken) {
          authToken = refreshedToken;
          response = await requestFactory(authToken);
        }
      }
      return response;
    } catch (e) {
      throw e;
    }
  };

  useEffect(() => {
    console.log("[LIFECYCLE] App mounted", { tokenPresent: !!token, tokenLength: token?.length, parentPresent: !!parent });

    const logTokenState = (label: string) => {
      console.log("[LIFECYCLE] " + label, {
        tokenPresent: !!token,
        tokenLength: token?.length,
        parentPresent: !!parent,
        documentHidden: document.hidden
      });
    };

    const handleVisibilityChange = () => {
      logTokenState("visibilitychange");
      if (document.visibilityState === "visible") {
        void ensureValidAccessToken();
      }
    };
    const handlePageShow = () => {
      logTokenState("pageshow");
      void ensureValidAccessToken();
    };
    const handlePageHide = () => logTokenState("pagehide");
    const handleWindowFocus = () => {
      logTokenState("window focus");
      void ensureValidAccessToken();
    };
    const handleWindowBlur = () => logTokenState("window blur");

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [token, parent]);

  useEffect(() => {
    console.log("[LIFECYCLE] token state changed", { tokenPresent: !!token, tokenLength: token?.length });
  }, [token]);

  useEffect(() => {
    if (refreshToken && !token) {
      void refreshAccessToken();
    }
  }, [refreshToken, token]);
  const [notificationTarget, setNotificationTarget] = useState<string | null>(null);
  const lastRegisteredPushTokenRef = useRef<string | null>(null);
  const registeringPushTokenRef = useRef<string | null>(null);
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
    };

    console.log("[LIFECYCLE] App useEffect install JS bridges", { url: window.location.href, documentHidden: document.hidden });

    runtime.setFcmToken = (token: string) => {
      console.log("[FCM_DEBUG] React received token via window.setFcmToken", token);
      setFcmToken(token);
      window.localStorage.setItem("fcm_token", token);
      console.log("[FCM_DEBUG] React stored fcm_token in localStorage");
    };

    runtime.setNotificationTarget = (target: string) => {
      console.log("[FCM] notification target received", target);
      setNotificationTarget(target);
    };

    return () => {
      delete runtime.setFcmToken;
      delete runtime.setNotificationTarget;
    };
  }, []);

  useEffect(() => {
    if (notificationTarget) {
      console.log("[FCM] notification target state updated", notificationTarget);
    }
  }, [notificationTarget]);

  useEffect(() => {
    const pushToken = fcmToken;
    if (!token || !pushToken) {
      console.log("[FCM_DEBUG] registerPushToken skipped because token or pushToken missing", { token: !!token, pushToken: !!pushToken });
      return;
    }

    console.log("[FCM_DEBUG] useEffect triggering registerPushToken", { token: !!token, pushTokenLength: pushToken.length });

    if (lastRegisteredPushTokenRef.current === pushToken || registeringPushTokenRef.current === pushToken) {
      return;
    }

    registeringPushTokenRef.current = pushToken;
    console.log("[FCM_DEBUG] Calling registerPushToken from App.tsx");
    void registerPushToken(pushToken)
      .then((success) => {
        if (success) {
          lastRegisteredPushTokenRef.current = pushToken;
        }
      })
      .finally(() => {
        if (registeringPushTokenRef.current === pushToken) {
          registeringPushTokenRef.current = null;
        }
      });
  }, [token, fcmToken]);

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
  
  // Persistent parent session state
  // Navigation states
  const [activeTab, setActiveTab] = useState("children");
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);

  // Notifications and delivery audit logs loaded from Express
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [deliveryLogs, setDeliveryLogs] = useState<CompleteDeliveryLog[]>([]);

  const registerPushToken = async (pushToken: string) => {
    const deviceId = getDeviceId();
    if (!deviceId) {
      console.error("[FCM] Impossible de générer un deviceId");
      return false;
    }

    try {
      console.log("[FCM] URL register:", withApiBase("/api/mobile/parent/devices/register-push-token"));
      const response = await performProtectedRequest((authToken) => fetch(withApiBase("/api/mobile/parent/devices/register-push-token"), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${authToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          pushToken,
          platform: "android",
          appVersion: "1.0.0",
          deviceId
        })
      }));

      if (!response) {
        return false;
      }

      if (response.status === 403) {
        handleLogout();
        return false;
      }

      return response.ok;
    } catch (e) {
      console.error("[FCM_DEBUG] registerPushToken threw", e);
      return false;
    }
  };
  // Fetch parent in-app notifications
  const fetchNotifications = async (activeToken?: string) => {
    const response = await performProtectedRequest((authToken) => fetch(withApiBase("/api/mobile/parent/notifications"), {
      headers: { "Authorization": `Bearer ${authToken}` }
    }));

    if (!response) {
      console.log("[AUTH_DEBUG] fetchNotifications skipped because token refresh failed or request failed");
      return;
    }

    if (response.status === 403) {
      setNotifications([]);
      handleLogout();
      return;
    }

    if (response.ok) {
      const raw = await response.clone().text();
      console.log('[APK DEBUG] GET response', raw);
      const data = await parseJsonSafe<AppNotification[]>(response.clone());
      const mapped = Array.isArray(data) ? data : [];
      console.log('[APK DEBUG] mapped notifications', mapped);
      setNotifications(mapped);
    }
  };

  // Fetch complete delivery audit logs from Dev endpoints
  const fetchDeliveryLogs = async () => {
    try {
      const response = await fetch(withApiBase("/api/dev/delivery-logs"));
      if (response.ok) {
        const data = await parseJsonSafe<CompleteDeliveryLog[]>(response);
        setDeliveryLogs(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Failed to fetch delivery logs", e);
    }
  };

  // Clear delivery logs
  const handleClearLogs = async () => {
    try {
      const response = await fetch(withApiBase("/api/dev/clear-logs"), { method: "POST" });
      if (response.ok) {
        setDeliveryLogs([]);
        setNotifications([]);
        alert("Historique des logs et des notifications effacé !");
      }
      } catch (e) {
    console.error(e);
  }
};

  // Poll for background notifications regularly when logged in
  useEffect(() => {
    if (token) {
      fetchNotifications();
      const interval = setInterval(() => {
        fetchNotifications();
        fetchDeliveryLogs();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [token]);

  // Initial load
  useEffect(() => {
    fetchDeliveryLogs();
  }, []);

  // Handlers for session authentication
  const handleLoginSuccess = (newToken: string, newParent: Parent, newRefreshToken: string) => {
    console.log("[AUTH_DEBUG] handleLoginSuccess new session stored", {
      hasToken: !!newToken,
      tokenLength: newToken.length,
      hasRefreshToken: !!newRefreshToken
    });
    localStorage.setItem("ecoletrack_token", newToken);
    localStorage.setItem("ecoletrack_refresh_token", newRefreshToken);
    localStorage.setItem("ecoletrack_parent", JSON.stringify(newParent));
    setToken(newToken);
    setRefreshToken(newRefreshToken);
    setParent(newParent);
    setActiveTab("children");
    setSelectedChild(null);
    fetchNotifications(newToken);
  };

  const handleLogout = () => {
    const currentToken = token;
    const currentFcmToken = fcmToken ?? (typeof window !== "undefined" ? window.localStorage.getItem("fcm_token") : null);
    const currentDeviceId = typeof window !== "undefined" ? window.localStorage.getItem("ecoletrack_device_id") : null;

    console.log("[AUTH_DEBUG] handleLogout called", {
      tokenPresent: !!currentToken,
      tokenLength: currentToken?.length,
      fcmTokenPresent: !!currentFcmToken,
      deviceId: currentDeviceId,
      documentHidden: typeof document !== "undefined" ? document.hidden : null,
      url: typeof window !== "undefined" ? window.location.href : null
    });

    localStorage.removeItem("ecoletrack_token");
    localStorage.removeItem("ecoletrack_refresh_token");
    localStorage.removeItem("ecoletrack_parent");
    setToken(null);
    setRefreshToken(null);
    refreshPromiseRef.current = null;
    setParent(null);
    setNotifications([]);
    setSelectedChild(null);

    if (!currentToken) {
      return;
    }

    const logoutPayload: Record<string, string> = {};
    if (currentFcmToken) {
      logoutPayload.pushToken = currentFcmToken;
    }
    if (currentDeviceId) {
      logoutPayload.deviceId = currentDeviceId;
    }

    void fetch(withApiBase("/api/mobile/parent/logout"), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${currentToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(logoutPayload)
    }).catch(() => undefined);
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
          refreshAccessToken={refreshAccessToken}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          selectedChild={selectedChild}
          setSelectedChild={setSelectedChild}
          notifications={notifications}
          fetchNotifications={fetchNotifications}
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
            refreshAccessToken={refreshAccessToken}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            selectedChild={selectedChild}
            setSelectedChild={setSelectedChild}
            notifications={notifications}
            fetchNotifications={fetchNotifications}
          />
        </div>

        {/* COLUMN 3: DEV TRIGGERS & LOG CONSOLE (4 cols) */}
        <div className="lg:col-span-4 h-auto lg:h-full lg:min-h-0 overflow-y-auto lg:overflow-hidden">
          <DeveloperConsole
            logs={deliveryLogs}
            onRefreshLogs={fetchDeliveryLogs}
            onClearLogs={handleClearLogs}
          />
        </div>

      </div>
    </div>
  );
}
