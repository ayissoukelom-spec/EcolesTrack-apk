/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Terminal, ShieldCheck, Play, RefreshCw, Trash2, CheckCircle2, 
  XCircle, AlertCircle, FileJson, Clock, Check, Eye 
} from "lucide-react";
import { motion } from "motion/react";
import { CompleteDeliveryLog } from "../types";

interface DeveloperConsoleProps {
  logs: CompleteDeliveryLog[];
  onRefreshLogs: () => void;
  onClearLogs: () => void;
}

export default function DeveloperConsole({
  logs,
  onRefreshLogs,
  onClearLogs
}: DeveloperConsoleProps) {
  
  // Tab states
  const [activeConsoleTab, setActiveConsoleTab] = useState<"trigger" | "logs">("trigger");
  
  // Event generator form states
  const [eventType, setEventType] = useState<"absence" | "grade">("absence");
  const [selectedChildId, setSelectedChildId] = useState("child-lucas");
  
  // Absence states
  const [absenceReason, setAbsenceReason] = useState("Grippe saisonnière");
  const [absenceJustified, setAbsenceJustified] = useState(false);
  const [absenceJustification, setAbsenceJustification] = useState("Certificat médical fourni");

  // Grade states
  const [gradeSubject, setGradeSubject] = useState("Mathématiques");
  const [gradeValue, setGradeValue] = useState("16.5");
  const [gradeCoeff, setGradeCoeff] = useState("1");
  const [gradeExamName, setGradeExamName] = useState("Contrôle Trigonométrie");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Inspector states
  const [inspectedLogId, setInspectedLogId] = useState<string | null>(null);

  // Auto-refresh logs on load
  useEffect(() => {
    onRefreshLogs();
  }, []);

  // Quick select preset values for easy testing
  const childrenPresets = [
    { id: "child-lucas", name: "Lucas Dupont (Jean)" },
    { id: "child-chloe", name: "Chloé Dupont (Jean)" },
    { id: "child-theo", name: "Théo Martin (Marie)" }
  ];

  const subjects = [
    "Mathématiques", "Français", "Anglais", "Histoire-Géographie", 
    "SVT", "Physique-Chimie", "Arts Plastiques", "EPS"
  ];

  const handleTriggerEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSuccessMessage(null);

    const url = eventType === "absence" ? "/api/dev/add-absence" : "/api/dev/add-grade";
    
    const body: any = {
      childId: selectedChildId,
      date: new Date().toISOString()
    };

    if (eventType === "absence") {
      body.reason = absenceReason;
      body.justified = absenceJustified;
      body.justificationText = absenceJustified ? absenceJustification : "";
    } else {
      body.subject = gradeSubject;
      body.grade = parseFloat(gradeValue);
      body.coefficient = parseFloat(gradeCoeff);
      body.examName = gradeExamName;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        setSuccessMessage(`Événement académique enregistré ! Notification multi-canal en cours d'orchestration.`);
        onRefreshLogs(); // Fetch fresh orchestrator log output
        
        // Auto-switch to logs tab to view the live timeline
        setTimeout(() => {
          setActiveConsoleTab("logs");
        }, 1000);
      } else {
        throw new Error("Failed to register academic event");
      }
    } catch (err) {
      alert("Error sending dev event");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-slate-100 flex flex-col h-full shadow-xl" id="developer-console-panel">
      
      {/* Console Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-2.5">
          <Terminal className="h-5 w-5 text-emerald-400 shrink-0" />
          <div>
            <h2 className="text-sm font-black tracking-tight flex items-center gap-1.5">
              Console de Contrôle Académique
              <span className="text-[10px] bg-emerald-950/80 text-emerald-400 border border-emerald-900 px-2 py-0.5 rounded font-mono">STAGING</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Simulez des événements scolaires pour auditer l&apos;orchestrateur multi-canal.</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-950 p-1 rounded-xl mb-4 text-xs font-semibold border border-slate-800 shrink-0">
        <button
          onClick={() => setActiveConsoleTab("trigger")}
          className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeConsoleTab === "trigger" ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-white"
          }`}
        >
          <Play className="h-3.5 w-3.5" />
          Enregistrer Événement
        </button>
        <button
          onClick={() => {
            setActiveConsoleTab("logs");
            onRefreshLogs();
          }}
          className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 relative ${
            activeConsoleTab === "logs" ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-white"
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          Logs de Livraison
          {logs.length > 0 && (
            <span className="bg-emerald-500 text-slate-950 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              {logs.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto pr-1">
        
        {/* TAB 1: EVENT GENERATOR */}
        {activeConsoleTab === "trigger" && (
          <form onSubmit={handleTriggerEvent} className="space-y-4">
            
            {/* Event selector */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Nature de l&apos;événement</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEventType("absence")}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                    eventType === "absence"
                      ? "bg-rose-950/40 border-rose-800 text-rose-300"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900"
                  }`}
                >
                  Absence / Retard
                </button>
                <button
                  type="button"
                  onClick={() => setEventType("grade")}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                    eventType === "grade"
                      ? "bg-indigo-950/40 border-indigo-800 text-indigo-300"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900"
                  }`}
                >
                  Note d&apos;Évaluation
                </button>
              </div>
            </div>

            {/* Child selector */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Élève concerné</label>
              <select
                value={selectedChildId}
                onChange={(e) => setSelectedChildId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-400 text-slate-200"
              >
                {childrenPresets.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Absence form fields */}
            {eventType === "absence" ? (
              <div className="space-y-3 bg-slate-950 p-3 rounded-xl border border-slate-850">
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold mb-1">Motif d&apos;absence</label>
                  <input
                    type="text"
                    value={absenceReason}
                    onChange={(e) => setAbsenceReason(e.target.value)}
                    placeholder="Ex: Gastro-entérite aiguë"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-xs font-medium focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="dev-justified"
                    checked={absenceJustified}
                    onChange={(e) => setAbsenceJustified(e.target.checked)}
                    className="h-4 w-4 text-emerald-500 bg-slate-900 border-slate-800 rounded focus:ring-emerald-400"
                  />
                  <label htmlFor="dev-justified" className="text-xs text-slate-300 font-semibold cursor-pointer select-none">
                    Absence pré-justifiée par justificatif ?
                  </label>
                </div>

                {absenceJustified && (
                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold mb-1">Texte du justificatif</label>
                    <input
                      type="text"
                      value={absenceJustification}
                      onChange={(e) => setAbsenceJustification(e.target.value)}
                      placeholder="Ex: Certificat médical envoyé"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-xs font-medium focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                )}
              </div>
            ) : (
              /* Grade form fields */
              <div className="space-y-3 bg-slate-950 p-3 rounded-xl border border-slate-850">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold mb-1">Matière</label>
                    <select
                      value={gradeSubject}
                      onChange={(e) => setGradeSubject(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-2 text-xs font-semibold text-slate-200"
                    >
                      {subjects.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold mb-1">Note (sur 20)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="20"
                      value={gradeValue}
                      onChange={(e) => setGradeValue(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-xs font-bold text-slate-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold mb-1">Coefficient</label>
                    <select
                      value={gradeCoeff}
                      onChange={(e) => setGradeCoeff(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-2 text-xs font-semibold text-slate-200"
                    >
                      <option value="1">1</option>
                      <option value="1.5">1.5</option>
                      <option value="2">2</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold mb-1">Nom du devoir</label>
                    <input
                      type="text"
                      value={gradeExamName}
                      onChange={(e) => setGradeExamName(e.target.value)}
                      placeholder="Ex: Devoir commun de rentrée"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-xs font-medium focus:outline-none text-slate-200"
                    />
                  </div>
                </div>
              </div>
            )}

            {successMessage && (
              <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-900 text-emerald-400 text-xs font-semibold flex items-start gap-2">
                <Check className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 text-slate-950 font-bold text-xs py-3 rounded-xl transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
            >
              <Terminal className="h-4 w-4" />
              {isSubmitting ? "Traitement de l'événement..." : "Enregistrer et notifier"}
            </button>
          </form>
        )}

        {/* TAB 2: AUDIT LOG TIMELINES */}
        {activeConsoleTab === "logs" && (
          <div className="space-y-4">
            {/* Controls */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">File de Jobs & Fallbacks</span>
              <div className="flex gap-2">
                <button
                  onClick={onRefreshLogs}
                  className="p-1.5 bg-slate-850 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors"
                  title="Rafraîchir"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={onClearLogs}
                  className="p-1.5 bg-rose-950/40 hover:bg-rose-900/40 border border-rose-900/40 rounded-lg text-rose-300 transition-colors"
                  title="Effacer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {logs.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs font-medium flex flex-col items-center gap-2 border border-dashed border-slate-800 rounded-2xl bg-slate-950/40">
                <ShieldCheck className="h-8 w-8 text-slate-700" />
                Aucune notification en file d&apos;attente.
                <span className="text-[10px] text-slate-600">Enregistrez une absence à gauche pour déclencher l&apos;orchestrateur.</span>
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => {
                  const event = log.event;
                  const deliveries = log.deliveries;
                  const payload = JSON.parse(event.payloadJson);

                  return (
                    <div key={event.id} className="bg-slate-950 border border-slate-850 rounded-xl p-3.5 space-y-3 shadow-md hover:border-slate-800 transition-colors">
                      
                      {/* Event details */}
                      <div className="flex items-start justify-between gap-4 border-b border-slate-900 pb-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                              event.eventType === "absence" ? "bg-rose-950/80 text-rose-400 border border-rose-900" : "bg-indigo-950/80 text-indigo-400 border border-indigo-900"
                            }`}>
                              {event.eventType === "absence" ? "Absence" : "Note"}
                            </span>
                            <span className="text-xs font-bold text-slate-200">
                              {payload.childName || "Élève"}
                            </span>
                          </div>
                          <span className="text-[9px] text-slate-500 font-mono block mt-1">Dedupe Key: {event.dedupeKey}</span>
                        </div>
                        <span className="text-[9px] text-slate-400 font-mono">
                          {new Date(event.createdAt).toLocaleTimeString("fr-FR")}
                        </span>
                      </div>

                      {/* Multi-channel fallback visual timeline */}
                      <div className="space-y-2.5 pt-1">
                        <h5 className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Parcours d&apos;orchestration multi-canal</h5>
                        
                        {/* Chronological delivery channels */}
                        <div className="relative border-l border-slate-800 ml-2.5 pl-4 space-y-3 py-1">
                          
                          {/* 1. PUSH CHANNEL */}
                          {(() => {
                            const del = deliveries.find(d => d.channel === "push");
                            const status = del?.status || "queued";
                            return (
                              <div className="relative">
                                {/* Chronology Dot */}
                                <div className={`absolute -left-[21px] top-0.5 h-3 w-3 rounded-full border-2 ${
                                  status === "delivered" ? "bg-emerald-400 border-slate-900" : "bg-rose-500 border-slate-900"
                                }`} />
                                
                                <div className="text-xs">
                                  <span className="font-bold text-slate-300 flex items-center gap-1.5">
                                    Canal 1 : Notification Push (FCM)
                                    {status === "delivered" ? (
                                      <span className="text-[9px] text-emerald-400 bg-emerald-950 px-1 py-0.2 rounded font-bold uppercase">Succès</span>
                                    ) : (
                                      <span className="text-[9px] text-rose-400 bg-rose-950 px-1 py-0.2 rounded font-bold uppercase">{del?.errorCode || "Indisponible"}</span>
                                    )}
                                  </span>
                                  <p className="text-[10px] text-slate-400 mt-0.5 leading-normal">
                                    {status === "delivered" 
                                      ? `Transmis à Firebase Cloud Messaging (ID: ${del?.providerMessageId}).` 
                                      : `${del?.errorMessage || "Le parent n&apos;a pas de session mobile active."}`}
                                  </p>
                                </div>
                              </div>
                            );
                          })()}

                          {/* 2. WHATSAPP FALLBACK */}
                          {(() => {
                            const del = deliveries.find(d => d.channel === "whatsapp");
                            // Fallback triggers if push failed
                            const pushDel = deliveries.find(d => d.channel === "push");
                            const wasTriggered = pushDel?.status !== "delivered";
                            const status = del?.status || "queued";

                            return (
                              <div className={`relative ${!wasTriggered ? "opacity-35" : ""}`}>
                                <div className={`absolute -left-[21px] top-0.5 h-3 w-3 rounded-full border-2 ${
                                  !wasTriggered ? "bg-slate-800 border-slate-900" :
                                  status === "delivered" ? "bg-emerald-400 border-slate-900" : "bg-rose-500 border-slate-900"
                                }`} />

                                <div className="text-xs">
                                  <span className="font-bold text-slate-300 flex items-center gap-1.5">
                                    Canal 2 : WhatsApp Cloud API (Fallback)
                                    {!wasTriggered ? (
                                      <span className="text-[9px] text-slate-500 bg-slate-900 px-1 py-0.2 rounded font-bold uppercase">Ignoré</span>
                                    ) : status === "delivered" ? (
                                      <span className="text-[9px] text-emerald-400 bg-emerald-950 px-1 py-0.2 rounded font-bold uppercase">Succès</span>
                                    ) : (
                                      <span className="text-[9px] text-rose-400 bg-rose-950 px-1 py-0.2 rounded font-bold uppercase">{del?.errorCode || "Indisponible"}</span>
                                    )}
                                  </span>
                                  <p className="text-[10px] text-slate-400 mt-0.5 leading-normal">
                                    {!wasTriggered 
                                      ? "Évité car le canal Push a abouti." 
                                      : status === "delivered" 
                                      ? `Gabarit envoyé via WhatsApp Cloud API (${del?.providerMessageId}).` 
                                      : `${del?.errorMessage || "Consentement de l'utilisateur manquant."}`}
                                  </p>
                                </div>
                              </div>
                            );
                          })()}

                          {/* 3. SMS FALLBACK */}
                          {(() => {
                            const del = deliveries.find(d => d.channel === "sms");
                            const pushDel = deliveries.find(d => d.channel === "push");
                            const waDel = deliveries.find(d => d.channel === "whatsapp");
                            
                            // Trigger if push AND whatsapp both failed
                            const wasTriggered = pushDel?.status !== "delivered" && waDel?.status !== "delivered";
                            const status = del?.status || "queued";

                            return (
                              <div className={`relative ${!wasTriggered ? "opacity-35" : ""}`}>
                                <div className={`absolute -left-[21px] top-0.5 h-3 w-3 rounded-full border-2 ${
                                  !wasTriggered ? "bg-slate-800 border-slate-900" :
                                  status === "delivered" ? "bg-emerald-400 border-slate-900" : "bg-rose-500 border-slate-900"
                                }`} />

                                <div className="text-xs">
                                  <span className="font-bold text-slate-300 flex items-center gap-1.5">
                                    Canal 3 : SMS Twilio Gateway (Fallback de secours)
                                    {!wasTriggered ? (
                                      <span className="text-[9px] text-slate-500 bg-slate-900 px-1 py-0.2 rounded font-bold uppercase">Ignoré</span>
                                    ) : status === "delivered" ? (
                                      <span className="text-[9px] text-emerald-400 bg-emerald-950 px-1 py-0.2 rounded font-bold uppercase">Succès</span>
                                    ) : (
                                      <span className="text-[9px] text-rose-400 bg-rose-950 px-1 py-0.2 rounded font-bold uppercase">{del?.errorCode || "Indisponible"}</span>
                                    )}
                                  </span>
                                  <p className="text-[10px] text-slate-400 mt-0.5 leading-normal">
                                    {!wasTriggered 
                                      ? "Évité car un canal de rang supérieur a abouti." 
                                      : status === "delivered" 
                                      ? `SMS prioritaire envoyé via Twilio.` 
                                      : `${del?.errorMessage || "Consentement de l'utilisateur manquant."}`}
                                  </p>
                                </div>
                              </div>
                            );
                          })()}

                        </div>

                      </div>

                      {/* Expose raw payload */}
                      <div>
                        <button
                          onClick={() => setInspectedLogId(inspectedLogId === event.id ? null : event.id)}
                          className="w-full bg-slate-900 hover:bg-slate-850 py-1.5 px-3.5 rounded-lg flex items-center justify-between text-[10px] text-slate-300 font-bold border border-slate-800"
                        >
                          <span className="flex items-center gap-1">
                            <FileJson className="h-3 w-3 text-amber-400" />
                            {inspectedLogId === event.id ? "Masquer le paquet JSON" : "Inspecter la requête HTTP JSON"}
                          </span>
                          <span className="text-slate-500">JSON</span>
                        </button>
                        
                        {inspectedLogId === event.id && (
                          <motion.pre 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="mt-2 p-2.5 rounded-lg bg-slate-950 border border-slate-850 text-[9px] font-mono text-emerald-300 overflow-x-auto max-h-[140px]"
                          >
                            {JSON.stringify({ event, deliveries }, null, 2)}
                          </motion.pre>
                        )}
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
