/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { 
  Lock, Mail, LogOut, User, Award, Calendar, Bell, Shield, 
  CheckCircle2, XCircle, ChevronRight, School, RefreshCw, Eye, AlertTriangle 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Parent, Child, Absence, Grade, AppNotification, NotificationPreferences, ParentConsent } from "../types";
import { getApiErrorMessage, parseJsonSafe, withApiBase } from "../utils/http";

interface ParentPortalProps {
  token: string | null;
  parent: Parent | null;
  onLoginSuccess: (token: string, parent: Parent) => void;
  onLogout: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedChild: Child | null;
  setSelectedChild: (child: Child | null) => void;
  notifications: AppNotification[];
  fetchNotifications: () => void;
}

export default function ParentPortal({
  token,
  parent,
  onLoginSuccess,
  onLogout,
  activeTab,
  setActiveTab,
  selectedChild,
  setSelectedChild,
  notifications,
  fetchNotifications
}: ParentPortalProps) {
  
  // Login credentials state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [childrenLoadError, setChildrenLoadError] = useState<string | null>(null);

  // Parent app active state loaded from endpoints
  const [children, setChildren] = useState<Child[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [consents, setConsents] = useState<ParentConsent[]>([]);
  const [activeSchoolId, setActiveSchoolId] = useState("");

  // Sub-tab inside child details (Notes vs Absences)
  const [childDetailTab, setChildDetailTab] = useState<"grades" | "absences">("grades");
  const [alertMenu, setAlertMenu] = useState<"grades" | "homework">("grades");
  const [gradeSubjectFilter, setGradeSubjectFilter] = useState("all");
  const [gradePeriodFilter, setGradePeriodFilter] = useState<"all" | "7d" | "30d" | "trimester">("all");

  // Load children list when authenticated
  const parentId = parent?.id;
  const parentActiveSchoolId = parent?.activeSchoolId;
  useEffect(() => {
    if (token && parentId) {
      fetchChildren();
      fetchPreferences();
      if (parentActiveSchoolId) {
        setActiveSchoolId(parentActiveSchoolId);
      }
    }
  }, [token, parentId, parentActiveSchoolId]);

  // Load specific child details when selected
  const selectedChildId = selectedChild?.id;
  useEffect(() => {
    if (token && selectedChildId) {
      fetchChildAbsences(selectedChildId);
      fetchChildGrades(selectedChildId);
      setGradeSubjectFilter("all");
      setGradePeriodFilter("all");
    }
  }, [token, selectedChildId]);

  const availableGradeSubjects = useMemo(
    () => Array.from(new Set(grades.map((g) => g.subject))).sort((a, b) => String(a).localeCompare(String(b), "fr")),
    [grades]
  );

  const displayedGrades = useMemo(() => {
    const subjectFiltered = gradeSubjectFilter === "all"
      ? grades
      : grades.filter((g) => g.subject === gradeSubjectFilter);

    if (gradePeriodFilter === "all") {
      return [...subjectFiltered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    const now = Date.now();
    const days = gradePeriodFilter === "7d" ? 7 : gradePeriodFilter === "30d" ? 30 : 90;
    const threshold = now - (days * 24 * 60 * 60 * 1000);

    return subjectFiltered
      .filter((g) => new Date(g.date).getTime() >= threshold)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [grades, gradeSubjectFilter, gradePeriodFilter]);

  // Quick preset accounts to speed up testing
  const presets = [
    { name: "Parent (Jean)", email: "jean.dupont@email.com", pass: "parent123", role: "parent" },
    { name: "Parent (Marie)", email: "marie.martin@email.com", pass: "parent123", role: "parent" },
    { name: "Prof (Maths)", email: "teacher@ecoletrack.fr", pass: "teacher123", role: "teacher" },
    { name: "Directeur Admin", email: "admin@ecoletrack.fr", pass: "admin123", role: "school_admin" }
  ];

  // API Call: Login
  const handleLogin = async (e?: React.FormEvent, customEmail?: string, customPass?: string) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    const loginEmail = customEmail || email;
    const loginPass = customPass || password;

    try {
      const response = await fetch(withApiBase("/api/mobile/parent/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPass })
      });

      const data = await parseJsonSafe<{ token?: string; parent?: Parent; error?: string }>(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, "Une erreur est survenue lors de la connexion."));
      }

      if (!data?.token || !data?.parent) {
        throw new Error("Le serveur a renvoye une reponse incomplete. Verifiez la connexion API.");
      }

      // Success
      onLoginSuccess(data.token, data.parent);
      setEmail("");
      setPassword("");
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // API Call: Fetch Children
  const fetchChildren = async () => {
    setChildrenLoadError(null);
    try {
      const response = await fetch(withApiBase("/api/mobile/parent/children"), {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await parseJsonSafe<Child[] | { error?: string }>(response);
      if (response.ok) {
        const nextChildren = Array.isArray(data) ? data : [];
        setChildren(nextChildren);
        if (nextChildren.length > 0) {
          const stillVisibleChild = selectedChildId
            ? nextChildren.find((child) => child.id === selectedChildId)
            : null;
          setSelectedChild(stillVisibleChild || nextChildren[0]);
        } else {
          setSelectedChild(null);
        }
      } else {
        const details = data && !Array.isArray(data) && data.error ? ` ${data.error}` : "";
        setChildrenLoadError(`Chargement des enfants impossible (${response.status}).${details}`);
      }
    } catch (e) {
      console.error("Failed to fetch children", e);
      setChildrenLoadError("Erreur reseau lors du chargement des enfants.");
    }
  };

  const handleSimulateChild = async () => {
    try {
      const response = await fetch(withApiBase("/api/mobile/parent/children/simulate"), {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (response.ok) {
        fetchChildren();
      }
    } catch (e) {
      console.error("Failed to simulate child", e);
    }
  };

  // API Call: Fetch Child Absences
  const fetchChildAbsences = async (childId: string) => {
    try {
      const response = await fetch(withApiBase(`/api/mobile/parent/children/${childId}/absences`), {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await parseJsonSafe<Absence[]>(response);
        setAbsences(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Failed to fetch absences", e);
    }
  };

  // API Call: Fetch Child Grades
  const fetchChildGrades = async (childId: string) => {
    try {
      const response = await fetch(withApiBase(`/api/mobile/parent/children/${childId}/grades`), {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await parseJsonSafe<Grade[]>(response);
        setGrades(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Failed to fetch grades", e);
    }
  };

  // API Call: Fetch Notification Preferences & Consents
  const fetchPreferences = async () => {
    try {
      const response = await fetch(withApiBase("/api/mobile/parent/notification-preferences"), {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await parseJsonSafe<{ preferences?: NotificationPreferences; consents?: ParentConsent[] }>(response);
        setPreferences(data?.preferences ?? null);
        setConsents(Array.isArray(data?.consents) ? data!.consents : []);
      }
    } catch (e) {
      console.error("Failed to fetch preferences", e);
    }
  };

  // API Call: Toggle Notification preferences and consents
  const handleTogglePreference = async (channel: "push" | "whatsapp" | "sms", currentVal: boolean) => {
    if (!preferences) return;

    const updates: any = {};
    if (channel === "push") updates.pushEnabled = !currentVal;
    if (channel === "whatsapp") updates.whatsappEnabled = !currentVal;
    if (channel === "sms") updates.smsEnabled = !currentVal;

    try {
      const response = await fetch(withApiBase("/api/mobile/parent/notification-preferences"), {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(updates)
      });
      if (response.ok) {
        const data = await parseJsonSafe<{ preferences?: NotificationPreferences; consents?: ParentConsent[] }>(response);
        setPreferences(data?.preferences ?? null);
        setConsents(Array.isArray(data?.consents) ? data!.consents : []);
        
        // Also trigger register token in background if user enabled push
        if (channel === "push" && !currentVal) {
          registerMockToken();
        }
      }
    } catch (e) {
      console.error("Failed to update preferences", e);
    }
  };

  // API Call: Consent Toggle explicitly
  const handleToggleConsent = async (channel: "whatsapp" | "sms", currentGranted: boolean) => {
    try {
      const response = await fetch(withApiBase("/api/mobile/parent/notification-preferences"), {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          [`${channel}Consent`]: !currentGranted
        })
      });
      if (response.ok) {
        const data = await parseJsonSafe<{ preferences?: NotificationPreferences; consents?: ParentConsent[] }>(response);
        setPreferences(data?.preferences ?? null);
        setConsents(Array.isArray(data?.consents) ? data!.consents : []);
      }
    } catch (e) {
      console.error("Failed to update consent", e);
    }
  };

  // Helper API Call: Register FCM token
  const registerMockToken = async () => {
    try {
      await fetch(withApiBase("/api/mobile/parent/devices/register-push-token"), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          pushToken: `fcm-token-${parent?.id}-${crypto.randomUUID().slice(0, 6)}`,
          platform: "android",
          appVersion: "2.4.1"
        })
      });
    } catch (e) {
      console.log("Mock token registration handled");
    }
  };

  // Simulate Absence Justification from App Side
  const justifyAbsence = async (absId: string) => {
    // We can simulate updating the state and saving.
    // In our JSON DB, we will update it and reload details.
    try {
      alert(`Simulation: Justification écrite envoyée pour Lucas. Notre équipe académique va la valider d'ici quelques minutes.`);
    } catch (e) {}
  };

  // Calculate Weighted Average
  const calculateAverage = (studentGrades: Grade[]) => {
    if (studentGrades.length === 0) return null;
    let totalScore = 0;
    let totalCoeff = 0;
    studentGrades.forEach(g => {
      totalScore += g.grade * g.coefficient;
      totalCoeff += g.coefficient;
    });
    return (totalScore / totalCoeff).toFixed(2);
  };

  const trimesterStart = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 90);
    return date;
  }, []);

  const currentTrimesterGrades = useMemo(
    () => grades.filter((grade) => new Date(grade.date).getTime() >= trimesterStart.getTime()),
    [grades, trimesterStart]
  );

  const currentTrimesterAbsences = useMemo(
    () => absences.filter((absence) => new Date(absence.date).getTime() >= trimesterStart.getTime()),
    [absences, trimesterStart]
  );

  const currentChild = selectedChild || children[0] || null;

  const formatBirthDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString("fr-FR");
    } catch {
      return dateString;
    }
  };

  const countWeekdays = (startDate: Date, endDate: Date) => {
    const cursor = new Date(startDate);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    let weekdays = 0;
    while (cursor <= end) {
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) weekdays += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
    return weekdays;
  };

  const currentTrimesterAverage = calculateAverage(currentTrimesterGrades);
  const uniqueCurrentAbsenceDates = new Set(
    currentTrimesterAbsences.map((absence) => new Date(absence.date).toDateString())
  ).size;
  const schoolDaysThisTrimester = countWeekdays(trimesterStart, new Date());
  const attendanceRate = schoolDaysThisTrimester > 0
    ? Math.max(0, Math.min(100, Math.round(((schoolDaysThisTrimester - uniqueCurrentAbsenceDates) / schoolDaysThisTrimester) * 100)))
    : 100;

  // Sync state helpers
  const handleSchoolChange = (schoolId: string) => {
    setActiveSchoolId(schoolId);
  };

  const handleNavigateTab = (tab: string) => {
    setSelectedChild(null);
    setActiveTab(tab);
  };

  const handleSelectChild = (child: Child) => {
    setSelectedChild(child);
    setChildDetailTab("grades");
  };

  const handleReadAllNotifications = async () => {
    try {
      const response = await fetch(withApiBase("/api/mobile/parent/notifications/read-all"), {
        method: "PUT",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (response.ok) {
        fetchNotifications();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const isGradeAlert = (notif: AppNotification) => {
    const content = `${notif.title} ${notif.message}`.toLowerCase();
    return (
      content.includes("note") ||
      content.includes("éval") ||
      content.includes("evaluation") ||
      content.includes("bulletin") ||
      content.includes("moyenne")
    );
  };

  const isHomeworkAlert = (notif: AppNotification) => {
    const content = `${notif.title} ${notif.message}`.toLowerCase();
    return (
      content.includes("devoir") ||
      content.includes("homework") ||
      content.includes("exercice")
    );
  };

  const gradeAlertNotifications = notifications.filter(isGradeAlert);
  const homeworkAlertNotifications = notifications.filter(isHomeworkAlert);
  const visibleAlertNotifications = alertMenu === "grades" ? gradeAlertNotifications : homeworkAlertNotifications;
  const unreadNotificationsCount = notifications.filter((n) => !n.read).length;
  const activeAlertsCount = [...gradeAlertNotifications, ...homeworkAlertNotifications].filter((n) => !n.read).length;

  // --- RENDERING VIEWS ---

  // Screen A: LOGIN SCREEN
  if (!token || !parent) {
    return (
      <div className="flex-1 flex flex-col bg-slate-50 p-6 overflow-y-auto text-slate-800" id="login-screen">
        {/* Brand header */}
        <div className="text-center my-6">
          <div className="mx-auto h-12 w-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-600/30">
            ÉT
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight mt-3">ÉcoleTrack</h1>
          <p className="text-xs text-slate-500 font-medium mt-1">Espace mobile d&apos;informations parents</p>
        </div>

        {/* Login Form card */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex-1 flex flex-col justify-between">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Adresse email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nom@email.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-10 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-indigo-600"
                >
                  <Eye className="h-4 w-4" />
                </button>
              </div>
            </div>

            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-[11px] font-semibold text-rose-600 flex items-start gap-2"
              >
                <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-md shadow-indigo-600/20 active:scale-95"
            >
              {isLoading ? "Connexion..." : "Se connecter"}
            </button>
          </form>

          {/* Quick Preset Buttons (To demonstrate role restriction & account switching) */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center mb-3">Comptes de test (Un clic)</h3>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleLogin(undefined, p.email, p.pass)}
                  className={`py-2 px-2.5 text-[10px] font-bold rounded-xl border transition-all text-left flex flex-col justify-between ${
                    p.role === "parent" 
                      ? "bg-indigo-50/50 border-indigo-100 text-indigo-700 hover:bg-indigo-50" 
                      : "bg-amber-50/50 border-amber-100 text-amber-800 hover:bg-amber-50"
                  }`}
                >
                  <span>{p.name}</span>
                  <span className="text-[8px] font-normal text-slate-400 mt-0.5 truncate">{p.email}</span>
                </button>
              ))}
            </div>
            <p className="text-[9px] text-center text-slate-400 leading-normal mt-4">
              * Les comptes <strong>Prof</strong> et <strong>Directeur</strong> échoueront avec une erreur <span className="text-rose-500 font-semibold">403 interdite</span> car l&apos;application est réservée aux parents.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Active School Metadata object
  const currentSchool = parent.schools.find(s => s.id === activeSchoolId) || parent.schools[0];

  // Screen B: LOGGED IN PORTAL VIEWPORT
  return (
    <div className="h-screen flex flex-col bg-slate-50 text-slate-800 overflow-hidden" id="portal-logged-in">
      
      {/* Dynamic Header */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-extrabold text-sm shadow-md shadow-indigo-600/10">
            ÉT
          </div>
          <div>
            <h2 className="text-xs font-black text-slate-900 leading-tight">ÉcoleTrack</h2>
            {/* Multi-school context picker */}
            {parent.schools.length > 1 ? (
              <div className="relative inline-block">
                <select
                  value={activeSchoolId}
                  onChange={(e) => handleSchoolChange(e.target.value)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold py-0.5 px-1.5 rounded flex items-center gap-1 focus:outline-none cursor-pointer border-none"
                >
                  {parent.schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <span className="text-[10px] text-slate-500 font-medium">{currentSchool?.name}</span>
            )}
          </div>
        </div>

        <button 
          onClick={onLogout}
          className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors border border-rose-100"
          title="Se déconnecter"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Main Body - View Switcher */}
      <div className="flex-1 overflow-y-auto p-4 pb-20">
        
        {/* Child Details Overlay View (Fiche Enfant) */}
        {selectedChild ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm"
          >
            {/* Child Header banner */}
            <div className="bg-slate-900 text-white p-4 relative">
              <button 
                onClick={() => setSelectedChild(null)}
                className="absolute top-3 right-3 text-[10px] bg-slate-800 text-slate-200 px-2 py-1 rounded-md hover:bg-slate-700 font-bold"
              >
                Retour
              </button>
              <div className="flex items-center gap-3">
                <img 
                  src={selectedChild.avatarUrl} 
                  alt={selectedChild.firstName} 
                  className="h-12 w-12 rounded-full border-2 border-indigo-400 object-cover"
                />
                <div>
                  <h3 className="text-sm font-bold">{selectedChild.firstName} {selectedChild.lastName}</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Classe : {selectedChild.className}</p>
                </div>
              </div>

              {/* Subtabs for Child File */}
              <div className="flex mt-4 bg-slate-800 rounded-lg p-0.5 text-xs font-semibold">
                <button
                  onClick={() => setChildDetailTab("grades")}
                  className={`flex-1 py-1.5 rounded-md transition-all ${
                    childDetailTab === "grades" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Notes & Évals
                </button>
                <button
                  onClick={() => setChildDetailTab("absences")}
                  className={`flex-1 py-1.5 rounded-md transition-all ${
                    childDetailTab === "absences" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Absences
                </button>
              </div>
            </div>

            {/* Child Tab Content */}
            <div className="p-4">
              {childDetailTab === "grades" ? (
                <div>
                  {/* Performance Summary Banner */}
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-4 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">Moyenne Générale</span>
                      <h4 className="text-lg font-black text-indigo-900">
                        {calculateAverage(grades) ? `${calculateAverage(grades)} / 20` : "-- / 20"}
                      </h4>
                    </div>
                    <Award className="h-8 w-8 text-indigo-500/80 shrink-0" />
                  </div>

                  {/* Grades feed */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Historique des évaluations</h4>
                    <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                      {displayedGrades.length} note(s)
                    </span>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="grade-subject-filter" className="text-[10px] font-bold text-slate-600 uppercase tracking-wider shrink-0">
                        Matiere
                      </label>
                      <select
                        id="grade-subject-filter"
                        value={gradeSubjectFilter}
                        onChange={(e) => setGradeSubjectFilter(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-[10px] font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-full max-w-[190px]"
                      >
                        <option value="all">Toutes les matieres</option>
                        {availableGradeSubjects.map((subject) => (
                          <option key={subject} value={subject}>{subject}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="grade-period-filter" className="text-[10px] font-bold text-slate-600 uppercase tracking-wider shrink-0">
                        Periode
                      </label>
                      <select
                        id="grade-period-filter"
                        value={gradePeriodFilter}
                        onChange={(e) => setGradePeriodFilter(e.target.value as "all" | "7d" | "30d" | "trimester")}
                        className="bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-[10px] font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-full max-w-[190px]"
                      >
                        <option value="all">Toute periode</option>
                        <option value="7d">7 derniers jours</option>
                        <option value="30d">30 derniers jours</option>
                        <option value="trimester">Trimestre</option>
                      </select>
                    </div>
                  </div>

                  {grades.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs font-medium">Aucune note enregistrée pour le moment.</div>
                  ) : displayedGrades.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs font-medium">Aucune note pour ce filtre matiere/periode.</div>
                  ) : (
                    <div className="space-y-2.5">
                      {displayedGrades.map((g) => {
                        let badgeClass = "bg-emerald-50 border-emerald-100 text-emerald-700";
                        if (g.grade < 10) badgeClass = "bg-rose-50 border-rose-100 text-rose-700";
                        else if (g.grade < 14) badgeClass = "bg-amber-50 border-amber-100 text-amber-700";

                        return (
                          <div key={g.id} className="border border-slate-100 rounded-xl p-2.5 hover:bg-slate-50 transition-colors flex items-center justify-between">
                            <div className="min-w-0">
                              <h5 className="text-xs font-bold truncate text-slate-800">{g.examName}</h5>
                              <p className="text-[10px] text-slate-500 font-medium">{g.subject} • Coeff {g.coefficient}</p>
                              <span className="text-[9px] text-slate-400 font-medium">Le {new Date(g.date).toLocaleDateString("fr-FR")}</span>
                            </div>
                            <div className={`border px-2.5 py-1.5 rounded-xl text-center shrink-0 min-w-[55px] ${badgeClass}`}>
                              <span className="text-xs font-black">{g.grade}</span>
                              <span className="text-[9px] block border-t border-current/20 mt-0.5 opacity-80">/20</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Relevé d&apos;absences</h4>
                  {absences.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs font-medium">Parfait ! Aucune absence enregistrée.</div>
                  ) : (
                    <div className="space-y-3">
                      {absences.map((abs) => (
                        <div key={abs.id} className="border border-slate-100 rounded-xl p-3 flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h5 className="text-xs font-bold text-slate-800">Date : {new Date(abs.date).toLocaleDateString("fr-FR")}</h5>
                              <p className="text-[11px] text-slate-600 mt-0.5 leading-normal font-semibold">Motif : {abs.reason}</p>
                            </div>
                            
                            {abs.justified ? (
                              <span className="shrink-0 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Justifiée
                              </span>
                            ) : (
                              <span className="shrink-0 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                                <XCircle className="h-3 w-3" />
                                Injustifiée
                              </span>
                            )}
                          </div>

                          {/* Justification details */}
                          {abs.justified ? (
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-[10px] text-slate-500 font-medium leading-normal">
                              <strong>Justificatif :</strong> {abs.justificationText || "Validé par l'établissement."}
                            </div>
                          ) : (
                            <button
                              onClick={() => justifyAbsence(abs.id)}
                              className="w-full bg-slate-900 hover:bg-indigo-600 text-white font-bold text-[10px] py-2 rounded-lg transition-colors mt-1"
                            >
                              Fournir un justificatif
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          /* Primary Navigation views */
          <AnimatePresence mode="wait">
            {activeTab === "children" && (
              <motion.div 
                key="children"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {/* School active welcome banner */}
                <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 text-white p-4 rounded-2xl shadow-sm relative overflow-hidden">
                  <div className="absolute -right-6 -bottom-6 h-24 w-24 bg-white/10 rounded-full blur-xl" />
                  <span className="text-[9px] font-bold tracking-wider uppercase bg-white/20 px-2 py-0.5 rounded-md">Portail Parent</span>
                  <h3 className="text-sm font-black mt-1">Bonjour, {parent.name} !</h3>
                  <p className="text-[11px] text-indigo-100 font-medium leading-snug mt-0.5">Retrouvez le relevé scolaire en temps réel de votre élève actif ci-dessous.</p>
                </div>

                {currentChild && (
                  <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={currentChild.avatarUrl}
                        alt={currentChild.firstName}
                        className="h-14 w-14 rounded-full object-cover border border-slate-100 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Actif</div>
                        <h4 className="text-sm font-black text-slate-900 truncate">{currentChild.firstName} {currentChild.lastName}</h4>
                        <p className="text-[11px] text-slate-500 font-medium">Classe : {currentChild.className}</p>
                        <p className="text-[11px] text-slate-500 font-medium">Date de naissance : {formatBirthDate(currentChild.birthDate)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-indigo-500">Note du trimestre</p>
                        <p className="text-xl font-black text-indigo-900 mt-1">
                          {currentTrimesterAverage ? `${currentTrimesterAverage} / 20` : "-- / 20"}
                        </p>
                        <p className="text-[10px] text-indigo-700/80 font-medium mt-0.5">{currentTrimesterGrades.length} évaluation(s)</p>
                      </div>
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-600">Assiduité</p>
                        <p className="text-xl font-black text-emerald-900 mt-1">{attendanceRate} %</p>
                        <p className="text-[10px] text-emerald-700/80 font-medium mt-0.5">{uniqueCurrentAbsenceDates} absence(s) sur la période</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedChild(currentChild);
                          setChildDetailTab("grades");
                        }}
                        className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-left hover:bg-indigo-50 transition-colors"
                      >
                        <div className="text-[9px] font-bold uppercase tracking-wider text-indigo-600">Raccourci</div>
                        <div className="mt-0.5 text-xs font-bold text-slate-900">Notes</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedChild(currentChild);
                          setChildDetailTab("absences");
                        }}
                        className="rounded-xl border border-emerald-100 bg-white px-3 py-2 text-left hover:bg-emerald-50 transition-colors"
                      >
                        <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-600">Raccourci</div>
                        <div className="mt-0.5 text-xs font-bold text-slate-900">Registre d&apos;absence</div>
                      </button>
                    </div>
                  </div>
                )}

                {/* Children List */}
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sélection de l&apos;élève</h3>
                {childrenLoadError && (
                  <div className="bg-rose-50 border border-rose-100 rounded-xl p-2.5 text-[11px] text-rose-700 font-semibold">
                    {childrenLoadError}
                  </div>
                )}
                {children.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-100 p-4 text-center">
                    <p className="text-xs text-slate-500 font-semibold">Aucun enfant rattaché pour ce compte.</p>
                    <div className="mt-3 flex items-center justify-center gap-2">
                      <button
                        onClick={fetchChildren}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-bold px-3 py-2 rounded-lg"
                      >
                        Rafraichir
                      </button>
                      <button
                        onClick={handleSimulateChild}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3 py-2 rounded-lg"
                      >
                        Simuler un enfant
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-100 p-2 shadow-sm space-y-1.5">
                    {children.length > 1 && (
                      <p className="px-2 pt-1 text-[10px] font-semibold text-slate-500">
                        Choisissez un seul élève à afficher.
                      </p>
                    )}
                    {children.map((child) => {
                      const isActiveChild = selectedChild?.id === child.id;

                      return (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => handleSelectChild(child)}
                          className={`w-full flex items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors ${
                            isActiveChild
                              ? "border-indigo-200 bg-indigo-50 text-indigo-900"
                              : "border-slate-100 bg-slate-50 text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/60"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold truncate">{child.firstName} {child.lastName}</div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isActiveChild && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-600 bg-white px-2 py-0.5 rounded-md border border-indigo-100">
                                Actif
                              </span>
                            )}
                            <ChevronRight className={`h-4 w-4 ${isActiveChild ? "text-indigo-600" : "text-slate-400"}`} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "notifications" && (
              <motion.div 
                key="notifications"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fil des absences</h3>
                  {notifications.length > 0 && (
                    <button 
                      onClick={handleReadAllNotifications}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold"
                    >
                      Tout marquer lu
                    </button>
                  )}
                </div>

                {notifications.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400 text-xs font-medium">
                    <Bell className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    Aucune notification in-app dans votre historique.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {notifications.map((notif) => (
                      <div 
                        key={notif.id}
                        onClick={async () => {
                          // Clicking on app notification, redirecting to specific child's tab
                          const firstChild = children[0];
                          if (firstChild) {
                            setSelectedChild(firstChild);
                            if (notif.title.includes("absence")) {
                              setChildDetailTab("absences");
                            } else {
                              setChildDetailTab("grades");
                            }
                          }
                          
                          // Mark as read
                          try {
                            await fetch(`/api/mobile/parent/notifications/read-all`, {
                              method: "PUT",
                              headers: { "Authorization": `Bearer ${token}` }
                            });
                            fetchNotifications();
                          } catch (e) {}
                        }}
                        className={`bg-white border rounded-2xl p-3 shadow-sm text-left relative cursor-pointer hover:border-indigo-100 transition-all ${
                          notif.read ? "border-slate-100 opacity-75" : "border-indigo-100 ring-1 ring-indigo-500/5"
                        }`}
                      >
                        {!notif.read && (
                          <span className="absolute top-3.5 right-3.5 h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
                        )}
                        <span className="text-[8px] text-slate-400 font-semibold uppercase">
                          {new Date(notif.createdAt).toLocaleDateString("fr-FR")} à {new Date(notif.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <h4 className="text-xs font-bold text-slate-800 mt-0.5">{notif.title}</h4>
                        <p className="text-[11px] text-slate-600 mt-1 leading-normal font-medium">{notif.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "alerts" && (
              <motion.div
                key="alerts"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <div className="bg-rose-50 border border-rose-100 rounded-2xl p-3 flex items-start gap-2.5">
                  <AlertTriangle className="h-4.5 w-4.5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-[11px] font-black text-rose-700">Centre d&apos;alertes parentales</h3>
                    <p className="text-[10px] text-rose-600 font-medium mt-0.5 leading-relaxed">
                      Les alertes sont séparées par type pour distinguer les notes publiées et les devoirs à venir.
                    </p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 p-1.5 grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setAlertMenu("grades")}
                    className={`rounded-xl px-3 py-2 text-[10px] font-bold transition-colors flex items-center justify-center gap-1.5 ${
                      alertMenu === "grades"
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    Notes publiées
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md ${alertMenu === "grades" ? "bg-white/20" : "bg-white"}`}>
                      {gradeAlertNotifications.length}
                    </span>
                  </button>
                  <button
                    onClick={() => setAlertMenu("homework")}
                    className={`rounded-xl px-3 py-2 text-[10px] font-bold transition-colors flex items-center justify-center gap-1.5 ${
                      alertMenu === "homework"
                        ? "bg-amber-600 text-white"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    Devoirs
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md ${alertMenu === "homework" ? "bg-white/20" : "bg-white"}`}>
                      {homeworkAlertNotifications.length}
                    </span>
                  </button>
                </div>

                {visibleAlertNotifications.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400 text-xs font-medium">
                    <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                    {alertMenu === "grades"
                      ? "Aucune alerte de notes publiée pour le moment."
                      : "Aucune alerte de devoir disponible. Le module devoirs sera alimenté prochainement."}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {visibleAlertNotifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={async () => {
                          const firstChild = children[0];
                          if (firstChild) {
                            setSelectedChild(firstChild);
                            setChildDetailTab("grades");
                          }

                          try {
                            await fetch(`/api/mobile/parent/notifications/read-all`, {
                              method: "PUT",
                              headers: { "Authorization": `Bearer ${token}` }
                            });
                            fetchNotifications();
                          } catch (e) {}
                        }}
                        className={`bg-white border rounded-2xl p-3 shadow-sm text-left relative cursor-pointer hover:border-rose-200 transition-all ${
                          notif.read ? "border-slate-100 opacity-75" : "border-rose-200 ring-1 ring-rose-500/10"
                        }`}
                      >
                        {!notif.read && (
                          <span className="absolute top-3.5 right-3.5 h-2 w-2 rounded-full bg-rose-600 animate-pulse" />
                        )}
                        <span className="text-[8px] text-slate-400 font-semibold uppercase">
                          {new Date(notif.createdAt).toLocaleDateString("fr-FR")} à {new Date(notif.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <h4 className="text-xs font-bold text-slate-800 mt-0.5 flex items-center gap-1.5">
                          <AlertTriangle className={`h-3.5 w-3.5 ${alertMenu === "grades" ? "text-indigo-500" : "text-amber-500"}`} />
                          {notif.title}
                        </h4>
                        <p className="text-[11px] text-slate-600 mt-1 leading-normal font-medium">{notif.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "preferences" && preferences && (
              <motion.div 
                key="preferences"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Canaux de notification</h3>
                
                <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-4 shadow-sm">
                  
                  {/* Push channel toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Notifications Push (Mobile)</h4>
                      <p className="text-[10px] text-slate-500">Alertes temps réel sur votre écran d&apos;accueil.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={preferences.pushEnabled} 
                        onChange={() => handleTogglePreference("push", preferences.pushEnabled)}
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  {/* WhatsApp channel toggle */}
                  <div className="flex items-center justify-between border-t border-slate-50 pt-4">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">WhatsApp académique</h4>
                      <p className="text-[10px] text-slate-500">Messages modèles officiels si Push indisponible.</p>
                      {!consents.find(c => c.channel === "whatsapp" && c.consentGranted && !c.revokedAt) && (
                        <span className="text-[8px] bg-rose-50 text-rose-600 font-bold px-1.5 py-0.5 rounded-md mt-1 inline-block">Consentement requis</span>
                      )}
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={preferences.whatsappEnabled} 
                        disabled={!consents.find(c => c.channel === "whatsapp" && c.consentGranted && !c.revokedAt)}
                        onChange={() => handleTogglePreference("whatsapp", preferences.whatsappEnabled)}
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 peer-disabled:opacity-50"></div>
                    </label>
                  </div>

                  {/* SMS channel toggle */}
                  <div className="flex items-center justify-between border-t border-slate-50 pt-4">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">SMS d&apos;urgence</h4>
                      <p className="text-[10px] text-slate-500">SMS de secours si aucun autre canal n&apos;est disponible.</p>
                      {!consents.find(c => c.channel === "sms" && c.consentGranted && !c.revokedAt) && (
                        <span className="text-[8px] bg-rose-50 text-rose-600 font-bold px-1.5 py-0.5 rounded-md mt-1 inline-block">Consentement requis</span>
                      )}
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={preferences.smsEnabled} 
                        disabled={!consents.find(c => c.channel === "sms" && c.consentGranted && !c.revokedAt)}
                        onChange={() => handleTogglePreference("sms", preferences.smsEnabled)}
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 peer-disabled:opacity-50"></div>
                    </label>
                  </div>

                </div>

                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Période de tranquillité</h3>
                <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-500 font-bold block mb-1">Heure de début</label>
                      <input 
                        type="time" 
                        value={preferences.quietHoursStart} 
                        onChange={(e) => handleTogglePreference("push", preferences.pushEnabled)} // Trigger save on change
                        className="bg-slate-100 rounded-xl py-1.5 px-2.5 text-xs font-bold focus:outline-none border-none w-full" 
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-500 font-bold block mb-1">Heure de fin</label>
                      <input 
                        type="time" 
                        value={preferences.quietHoursEnd} 
                        onChange={(e) => handleTogglePreference("push", preferences.pushEnabled)} // Trigger save
                        className="bg-slate-100 rounded-xl py-1.5 px-2.5 text-xs font-bold focus:outline-none border-none w-full" 
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal font-medium mt-1">
                    * Durant ces heures, les SMS et WhatsApp sont bloqués et stockés pour livraison ultérieure afin de ne pas perturber votre sommeil.
                  </p>
                </div>
              </motion.div>
            )}

            {activeTab === "consent" && (
              <motion.div 
                key="consent"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Centre de consentement légal</h3>
                
                <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-4">
                  <div className="text-[11px] text-slate-600 font-semibold leading-relaxed border-b border-slate-50 pb-3 flex items-start gap-2.5">
                    <Shield className="h-5 w-5 text-indigo-600 shrink-0" />
                    <span>Conformément aux réglementations RGPD et WhatsApp Business Policy, nous requérons votre accord explicite pour l&apos;envoi de relevés académiques.</span>
                  </div>

                  {/* WhatsApp explicit consent */}
                  <div className="flex items-start gap-3">
                    <input 
                      type="checkbox" 
                      id="opt-in-wa"
                      checked={!!consents.find(c => c.channel === "whatsapp" && c.consentGranted && !c.revokedAt)}
                      onChange={() => {
                        const active = consents.find(c => c.channel === "whatsapp" && c.consentGranted && !c.revokedAt);
                        handleToggleConsent("whatsapp", !!active);
                      }}
                      className="mt-1 shrink-0 h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="opt-in-wa" className="text-xs text-slate-700 leading-normal font-medium">
                      <strong className="block text-slate-900">Opt-in WhatsApp Académique</strong>
                      J&apos;autorise l&apos;établissement à m&apos;envoyer des notifications d&apos;absence et de notes par WhatsApp. <span className="text-slate-400 font-mono text-[9px]">(Version v1.0-fr)</span>
                    </label>
                  </div>

                  {/* SMS explicit consent */}
                  <div className="flex items-start gap-3 border-t border-slate-50 pt-4">
                    <input 
                      type="checkbox" 
                      id="opt-in-sms"
                      checked={!!consents.find(c => c.channel === "sms" && c.consentGranted && !c.revokedAt)}
                      onChange={() => {
                        const active = consents.find(c => c.channel === "sms" && c.consentGranted && !c.revokedAt);
                        handleToggleConsent("sms", !!active);
                      }}
                      className="mt-1 shrink-0 h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="opt-in-sms" className="text-xs text-slate-700 leading-normal font-medium">
                      <strong className="block text-slate-900">Opt-in SMS d&apos;Urgence</strong>
                      J&apos;autorise l&apos;établissement à m&apos;envoyer des SMS d&apos;absence prioritaires. <span className="text-slate-400 font-mono text-[9px]">(Version v1.0-fr)</span>
                    </label>
                  </div>
                </div>

                {/* Horodating consent history table */}
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Historique de consentement légal</h3>
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                  {consents.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 text-xs font-medium">Aucun historique de consentement.</div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-[9px] font-bold tracking-wider border-b border-slate-100 uppercase">
                          <th className="p-2.5">Canal</th>
                          <th className="p-2.5">Action</th>
                          <th className="p-2.5">Version</th>
                          <th className="p-2.5">Date & Heure</th>
                        </tr>
                      </thead>
                      <tbody className="text-[10px] font-medium text-slate-700 divide-y divide-slate-50">
                        {consents.map((c) => (
                          <tr key={c.id}>
                            <td className="p-2.5 font-bold uppercase text-slate-800">{c.channel}</td>
                            <td className="p-2.5">
                              {c.consentGranted && !c.revokedAt ? (
                                <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">Autorisé</span>
                              ) : (
                                <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md">Révoqué</span>
                              )}
                            </td>
                            <td className="p-2.5 font-mono text-[9px] text-slate-400">{c.consentTextVersion}</td>
                            <td className="p-2.5 font-mono text-[9px] text-slate-500">
                              {new Date(c.consentedAt).toLocaleDateString("fr-FR")} {new Date(c.consentedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

      </div>

      {/* Persistent Bottom Bar Navigation - Parent Portal */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-100 flex items-center justify-around px-2 py-1 shadow-md z-50">
        <button
          onClick={() => handleNavigateTab("children")}
          className={`flex-1 flex flex-col items-center gap-1 py-1 text-[9px] font-bold ${
            activeTab === "children" ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <School className="h-4.5 w-4.5" />
          <span>Accueil</span>
        </button>

        <button
          onClick={() => handleNavigateTab("alerts")}
          className={`flex-1 flex flex-col items-center gap-1 py-1 text-[9px] font-bold relative ${
            activeTab === "alerts" ? "text-rose-600" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          {activeAlertsCount > 0 && (
            <span className="absolute top-1 right-8 h-2 w-2 rounded-full bg-rose-600 animate-pulse" />
          )}
          <AlertTriangle className="h-4.5 w-4.5" />
          <span>Alertes</span>
        </button>

        <button
          onClick={() => handleNavigateTab("notifications")}
          className={`flex-1 flex flex-col items-center gap-1 py-1 text-[9px] font-bold relative ${
            activeTab === "notifications" ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          {unreadNotificationsCount > 0 && (
            <span className="absolute top-1 right-8 h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
          )}
          <Bell className="h-4.5 w-4.5" />
          <span>Absence</span>
        </button>

        <button
          onClick={() => handleNavigateTab("preferences")}
          className={`flex-1 flex flex-col items-center gap-1 py-1 text-[9px] font-bold ${
            activeTab === "preferences" ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <RefreshCw className="h-4.5 w-4.5" />
          <span>Canaux</span>
        </button>

        <button
          onClick={() => handleNavigateTab("consent")}
          className={`flex-1 flex flex-col items-center gap-1 py-1 text-[9px] font-bold ${
            activeTab === "consent" ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <Shield className="h-4.5 w-4.5" />
          <span>Consentement</span>
        </button>
      </div>
    </div>
  );
}
