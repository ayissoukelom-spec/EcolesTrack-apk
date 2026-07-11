/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Terminal, ShieldCheck, Play, RefreshCw, Trash2, Smartphone, 
  BookOpen, HelpCircle, Code, HelpCircle as HelpIcon 
} from "lucide-react";
import AndroidEmulator from "./components/AndroidEmulator";
import ParentPortal from "./components/ParentPortal";
import DeveloperConsole from "./components/DeveloperConsole";
import { Parent, Child, AppNotification, CompleteDeliveryLog } from "./types";
import { parseJsonSafe, withApiBase } from "./utils/http";

export default function App() {
  const isMobileProductionMode = (() => {
    const envFlag = (import.meta as any)?.env?.VITE_MOBILE_PRODUCTION === "true";
    const isAndroidWebViewHost = typeof window !== "undefined" && window.location.host === "appassets.androidplatform.net";
    return envFlag || isAndroidWebViewHost;
  })();
  
  // Persistent parent session state
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("ecoletrack_token"));
  const [parent, setParent] = useState<Parent | null>(() => {
    const saved = localStorage.getItem("ecoletrack_parent");
    return saved ? JSON.parse(saved) : null;
  });

  // Navigation states
  const [activeTab, setActiveTab] = useState("children");
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);

  // Notifications and delivery audit logs loaded from Express
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [deliveryLogs, setDeliveryLogs] = useState<CompleteDeliveryLog[]>([]);

  // Fetch parent in-app notifications
  const fetchNotifications = async () => {
    if (!token) return;
    try {
      const response = await fetch(withApiBase("/api/mobile/parent/notifications"), {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await parseJsonSafe<AppNotification[]>(response);
        setNotifications(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Failed to fetch notifications", e);
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
  const handleLoginSuccess = (newToken: string, newParent: Parent) => {
    localStorage.setItem("ecoletrack_token", newToken);
    localStorage.setItem("ecoletrack_parent", JSON.stringify(newParent));
    setToken(newToken);
    setParent(newParent);
    setActiveTab("children");
    setSelectedChild(null);
    fetchNotifications();
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await fetch(withApiBase("/api/mobile/parent/logout"), {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` }
        });
      } catch (e) {}
    }
    localStorage.removeItem("ecoletrack_token");
    localStorage.removeItem("ecoletrack_parent");
    setToken(null);
    setParent(null);
    setNotifications([]);
    setSelectedChild(null);
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
      <div className="h-screen overflow-hidden bg-slate-50 text-slate-900 flex flex-col" id="ecoletrack-mobile-production">
        <ParentPortal
          token={token}
          parent={parent}
          onLoginSuccess={handleLoginSuccess}
          onLogout={handleLogout}
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans" id="ecoletrack-workspace">
      
      {/* Upper Navigation banner */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-indigo-600/20">
            ÉT
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-white flex items-center gap-2">
              ÉcoleTrack Workspace
              <span className="text-[10px] bg-indigo-950 text-indigo-400 border border-indigo-800 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                Fullstack SDK
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">Auditeur d&apos;orchestration multi-canal & Émulateur Android Parent</p>
          </div>
        </div>

        {/* Health State badge */}
        <div className="flex items-center gap-2 bg-slate-950 border border-slate-850 px-3 py-1.5 rounded-xl">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-bold text-slate-300 font-mono">Backend: PORT 3001 (Vite + Express)</span>
        </div>
      </header>

      {/* Main workspace layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-y-auto lg:min-h-0">
        
        {/* COLUMN 1: SETUP DOCUMENTATION GUIDE (4 cols) */}
        <div className="lg:col-span-4 bg-slate-900/40 border border-slate-900 rounded-2xl p-5 overflow-y-auto flex flex-col justify-between h-auto lg:h-full">
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

              <section className="bg-slate-950 p-3 rounded-xl border border-slate-900">
                <h3 className="font-bold text-slate-200 mb-1 text-[11px] flex items-center gap-1.5">
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
        <div className="lg:col-span-4 flex items-start lg:items-center justify-center h-auto lg:h-full lg:min-h-0 lg:overflow-y-auto py-2 lg:py-0">
          <AndroidEmulator
            notifications={notifications}
            onNotificationClick={handleNotificationClick}
            onClearNotifications={handleClearLogs}
            onPowerReset={handlePowerCycle}
          >
            <ParentPortal
              token={token}
              parent={parent}
              onLoginSuccess={handleLoginSuccess}
              onLogout={handleLogout}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              selectedChild={selectedChild}
              setSelectedChild={setSelectedChild}
              notifications={notifications}
              fetchNotifications={fetchNotifications}
            />
          </AndroidEmulator>
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
