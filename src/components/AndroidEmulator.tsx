/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Wifi, Signal, Battery, Bell, ChevronDown, ChevronUp, Trash2, 
  RotateCcw, Info, MessageSquare, ArrowLeft, Smartphone 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AppNotification } from "../types";

interface AndroidEmulatorProps {
  children: React.ReactNode;
  notifications: AppNotification[];
  onNotificationClick: (notif: AppNotification) => void;
  onClearNotifications: () => void;
  onPowerReset: () => void;
}

export default function AndroidEmulator({
  children,
  notifications,
  onNotificationClick,
  onClearNotifications,
  onPowerReset
}: AndroidEmulatorProps) {
  const [currentTime, setCurrentTime] = useState<string>("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Auto-updating Android system clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      setCurrentTime(`${hours}:${minutes}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div
      className="relative mx-auto shrink-0 w-full max-w-[360px]"
      style={{ aspectRatio: "360 / 740" }}
      id="android-emulator-container"
    >
      {/* Phone Outer Shell */}
      <div className="relative w-full h-full rounded-[48px] border-[10px] border-slate-800 bg-slate-950 p-2 shadow-2xl ring-4 ring-slate-700/50 flex flex-col">
        
        {/* Speaker & Camera Punch-hole Notch */}
        <div className="absolute top-0 left-1/2 z-50 h-5 w-36 -translate-x-1/2 rounded-b-2xl bg-slate-800 flex items-center justify-center gap-2">
          <div className="h-1 w-12 rounded-full bg-slate-900" /> {/* Speaker */}
          <div className="h-2 w-2 rounded-full bg-slate-900 border border-slate-700" /> {/* Camera */}
        </div>

        {/* Dynamic Android Screen */}
        <div className="relative h-full w-full overflow-hidden rounded-[38px] bg-slate-900 text-white flex flex-col select-none">
          
          {/* 1. Android Status Bar */}
          <div 
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className="h-8 bg-slate-950 px-5 pt-1.5 flex items-center justify-between text-[11px] font-medium tracking-wider text-slate-200 z-40 cursor-pointer hover:bg-slate-900/80 transition-colors"
          >
            {/* Status bar Left: Time & Push indicators */}
            <div className="flex items-center gap-1.5">
              <span>{currentTime}</span>
              {unreadCount > 0 && (
                <motion.div 
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center text-amber-400"
                >
                  <Bell className="h-3 w-3 fill-current" />
                  <span className="text-[9px] ml-0.5 font-bold">{unreadCount}</span>
                </motion.div>
              )}
            </div>

            {/* Status bar Right: Wi-Fi, Signal, Battery */}
            <div className="flex items-center gap-1.5">
              <Signal className="h-3 w-3 text-emerald-400" />
              <Wifi className="h-3 w-3 text-emerald-400" />
              <div className="flex items-center gap-0.5">
                <Battery className="h-3.5 w-3.5 text-emerald-400" />
                <span>98%</span>
              </div>
            </div>
          </div>

          {/* 2. System Notification Drop-down Drawer */}
          <AnimatePresence>
            {isDrawerOpen && (
              <motion.div
                initial={{ y: "-100%" }}
                animate={{ y: 0 }}
                exit={{ y: "-100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="absolute inset-x-0 top-8 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 p-4 pb-6 shadow-xl z-30 max-h-[85%] overflow-y-auto"
              >
                {/* System Drawer Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-semibold text-slate-300">Centre de notifications</span>
                  </div>
                  {notifications.length > 0 && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onClearNotifications();
                      }}
                      className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors"
                      title="Effacer tout"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Notifications List */}
                {notifications.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-xs flex flex-col items-center gap-1">
                    <Bell className="h-6 w-6 text-slate-600 mb-1" />
                    Aucune notification push reçue.
                    <span className="text-[10px] text-slate-600">Générez une absence ou note à droite pour tester.</span>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {notifications.map((notif) => (
                      <motion.div
                        key={notif.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={() => {
                          onNotificationClick(notif);
                          setIsDrawerOpen(false);
                        }}
                        className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all duration-200 ${
                          notif.read 
                            ? 'bg-slate-900/50 border-slate-800/80 text-slate-400' 
                            : 'bg-emerald-950/30 border-emerald-800/50 text-slate-100 hover:bg-emerald-950/40'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded ${
                            notif.title.includes("Absence") ? "bg-rose-900/40 text-rose-300" : "bg-emerald-900/40 text-emerald-300"
                          }`}>
                            {notif.title.includes("Absence") ? "Absence" : "Évaluation"}
                          </span>
                          <span className="text-[9px] text-slate-500">
                            {new Date(notif.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold truncate">{notif.title}</h4>
                        <p className="text-[11px] text-slate-300 line-clamp-2 mt-0.5 leading-relaxed">{notif.message}</p>
                        
                        {notif.deepLink && (
                          <div className="mt-1.5 pt-1.5 border-t border-slate-800 flex items-center justify-between text-[9px] text-emerald-400 font-semibold uppercase">
                            <span>Ouvrir dans l&apos;application</span>
                            <ArrowLeft className="h-2 w-2 rotate-180" />
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* Close handle button */}
                <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2">
                  <button 
                    onClick={() => setIsDrawerOpen(false)}
                    className="p-1 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 3. Main Emulator Viewport Content */}
          <div className="flex-1 overflow-hidden relative flex flex-col bg-slate-950">
            {children}
          </div>

          {/* 4. Android Bottom Virtual Navigation Bar */}
          <div className="h-10 bg-slate-950 flex items-center justify-around px-10 border-t border-slate-900 z-20">
            {/* Back button (Simulated via visual icon) */}
            <button 
              onClick={() => setIsDrawerOpen(false)}
              className="p-2 text-slate-400 hover:text-white rounded-full transition-colors"
              title="Retour"
            >
              <svg className="h-4 w-4 fill-current rotate-180" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
            {/* Home button */}
            <button 
              onClick={() => {
                setIsDrawerOpen(false);
                onPowerReset();
              }}
              className="h-3.5 w-3.5 rounded-full border-2 border-slate-400 hover:border-white transition-colors"
              title="Accueil Système"
            />
            {/* Recent Apps / Power Cycle button */}
            <button 
              onClick={onPowerReset}
              className="p-2 text-slate-400 hover:text-amber-400 rounded-full transition-colors"
              title="Redémarrer l'App"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

        </div>

        {/* Physical Button simulations */}
        <div className="absolute top-24 -right-2.5 h-12 w-1 rounded-l-md bg-slate-800" /> {/* Power */}
        <div className="absolute top-44 -right-2.5 h-16 w-1 rounded-l-md bg-slate-800" /> {/* Volume Up/Down */}
      </div>
    </div>
  );
}
