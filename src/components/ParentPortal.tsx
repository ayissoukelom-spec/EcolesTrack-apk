/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { 
  Lock, Mail, LogOut, User, Award, Calendar, Bell, Shield, 
  CheckCircle2, XCircle, ChevronRight, School, Eye, AlertTriangle 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import logoImage from "../assets/logo.png";
import { Parent, Child, Absence, Grade, AppNotification } from "../types";
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
  // APK debug: log incoming props
  console.log('[APK DEBUG] ParentPortal props', { notifications });
  
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

  const [activeSchoolId, setActiveSchoolId] = useState("");
  const [localNotifications, setLocalNotifications] = useState<AppNotification[]>(notifications);
  const [markingNotificationIds, setMarkingNotificationIds] = useState<string[]>([]);
  const [readOverrides, setReadOverrides] = useState<Set<string>>(new Set());

  // Keep a local copy of notifications so the badge updates immediately.
  useEffect(() => {
    const mapped = notifications.map((notif) => ({
      ...notif,
      read: notif.read || readOverrides.has(notif.id)
    }));
    console.log('[APK DEBUG] localNotifications (before set)', mapped);
    setLocalNotifications(mapped);
  }, [notifications, readOverrides]);

  // Sub-tab inside child details (Notes vs Absences)
  const [childDetailTab, setChildDetailTab] = useState<"grades" | "absences">("grades");
  const [alertMenu, setAlertMenu] = useState<"notes" | "homework" | "absences" | "info">("notes");
  const [gradeSubjectFilter, setGradeSubjectFilter] = useState("all");
  const [gradePeriodFilter, setGradePeriodFilter] = useState<"all" | "7d" | "30d" | "trimester">("all");
  
  // Load children list when authenticated
  const parentId = parent?.id;
  const parentActiveSchoolId = parent?.activeSchoolId;
  useEffect(() => {
    if (token && parentId) {
      fetchChildren();
      if (parentActiveSchoolId) {
        setActiveSchoolId(parentActiveSchoolId);
      }
    }
  }, [token, parentId, parentActiveSchoolId]);

  useEffect(() => {
    if (children.length > 0 && !selectedChild) {
      setSelectedChild(children[0]);
    }
  }, [children, selectedChild]);

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

  const displayedGradesAverage = calculateAverage(displayedGrades);

  const getGradeToneClasses = (grade: number, maxScore?: number) => {
    const normalizedScore = maxScore && maxScore > 0 ? (grade / maxScore) * 20 : grade;

    if (normalizedScore < 10) {
      return {
        card: "border-rose-800 bg-slate-950",
        title: "text-rose-300",
        value: "text-rose-300",
        meta: "text-rose-400"
      };
    }

    if (normalizedScore < 14) {
      return {
        card: "border-amber-800 bg-slate-950",
        title: "text-amber-200",
        value: "text-amber-200",
        meta: "text-amber-300"
      };
    }

    return {
      card: "border-emerald-800 bg-slate-950",
      title: "text-emerald-200",
      value: "text-emerald-200",
      meta: "text-emerald-300"
    };
  };

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
          setSelectedChild(stillVisibleChild || null);
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
        // Sort absences by date descending (most recent first)
        const sortedAbsences = Array.isArray(data) 
          ? [...data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          : [];
        setAbsences(sortedAbsences);
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
  function calculateAverage(studentGrades: Grade[]) {
    if (studentGrades.length === 0) return null;
    let totalScore = 0;
    let totalCoeff = 0;
    studentGrades.forEach(g => {
      totalScore += g.grade * g.coefficient;
      totalCoeff += g.coefficient;
    });
    return (totalScore / totalCoeff).toFixed(2);
  }

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

  const absenceCount = currentTrimesterAbsences.length;
  console.log("Absences reçues API :", absences);
  console.log("Nombre calculé :", absenceCount);

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
      const data = await parseJsonSafe(response);
      if (response.ok) {
        setLocalNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
        setReadOverrides(new Set(localNotifications.map((item) => item.id)));
        fetchNotifications();
      } else {
        console.error("Failed to mark all notifications as read", getApiErrorMessage(data, "Unknown API error"));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleMarkNotificationRead = async (notif: AppNotification) => {
    console.log('[APK DEBUG] handleMarkNotificationRead called', { id: notif.id, read: notif.read });
    if (notif.read || markingNotificationIds.includes(notif.id)) {
      return;
    }

    setReadOverrides((prev) => {
      const next = new Set(prev);
      next.add(notif.id);
      return next;
    });
    setLocalNotifications((prev) => prev.map((item) =>
      item.id === notif.id ? { ...item, read: true } : item
    ));
    setMarkingNotificationIds((prev) => [...prev, notif.id]);

    try {
      const response = await fetch(withApiBase(`/api/mobile/parent/notifications/${notif.id}/read`), {
        method: "PUT",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const responseData = await parseJsonSafe(response);
      if (!response.ok) {
        const errorMessage = getApiErrorMessage(responseData, `Failed to mark notification ${notif.id} as read`);
        throw new Error(errorMessage);
      }
      fetchNotifications();
    } catch (e) {
      console.error(`Failed to mark notification ${notif.id} as read`, e);
      setReadOverrides((prev) => {
        const next = new Set(prev);
        next.delete(notif.id);
        return next;
      });
      setLocalNotifications((prev) => prev.map((item) =>
        item.id === notif.id ? { ...item, read: false } : item
      ));
    } finally {
      setMarkingNotificationIds((prev) => prev.filter((id) => id !== notif.id));
    }
  };

  const normalizeNotificationText = (text?: string) =>
    (text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[-\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .trim();

  const classifyParentNotification = (notif: AppNotification) => {
    const payload = normalizeNotificationText(`${notif.title} ${notif.message}`);

    if (/\b(devoir|homework|assignment|exercice|travail)\b/.test(payload)) {
      return "homework";
    }

    if (/\b(note|notes|moyenne|evaluation|évaluation|éval|bulletin)\b/.test(payload)) {
      return "notes";
    }

    if (/\b(absence|absences|retard|retards)\b/.test(payload)) {
      return "absences";
    }

    if (/\b(info|information|informations|annonce|message|communique|communiqué|actualité)\b/.test(payload)) {
      return "info";
    }

    return "info";
  };

  const notesNotifications = localNotifications.filter((notif) => classifyParentNotification(notif) === "notes");
  const homeworkNotifications = localNotifications.filter((notif) => classifyParentNotification(notif) === "homework");
  const absenceNotifications = localNotifications.filter((notif) => classifyParentNotification(notif) === "absences");
  const infoNotifications = localNotifications.filter((notif) => classifyParentNotification(notif) === "info");
  const visibleAlertNotifications =
    alertMenu === "notes"
      ? notesNotifications
      : alertMenu === "homework"
        ? homeworkNotifications
        : alertMenu === "absences"
          ? absenceNotifications
          : infoNotifications;

  const unreadNotificationsCount = localNotifications.filter((n) => !n.read).length;
  const activeAlertsCount = [...notesNotifications, ...homeworkNotifications, ...absenceNotifications, ...infoNotifications].filter((n) => !n.read).length;

  // --- RENDERING VIEWS ---

  // Screen A: LOGIN SCREEN
  if (!token || !parent) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen px-4 py-8 bg-slate-950 text-slate-100" id="login-screen">
        <div className="w-full max-w-md">
          <div className="rounded-[2rem] border border-slate-800 bg-slate-900/95 p-7 shadow-2xl shadow-indigo-900/30">
            <div className="flex flex-col items-center gap-4 mb-7 text-center">
              <img
                src={logoImage}
                alt="Ecoles Track"
                className="mx-auto h-20 w-20 rounded-3xl object-contain shadow-lg shadow-indigo-900/20"
              />
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-white">Ecoles Track</h1>
                <p className="text-xs text-slate-500 mt-1">Portail parents</p>
              </div>
            </div>
            <div className="space-y-3 mb-7">
              <div className="inline-flex items-center justify-center rounded-full bg-slate-800/90 px-3 py-2 text-xs font-semibold text-slate-100 ring-1 ring-slate-700">
                <span className="text-lg">🇹🇬</span>
                <span className="ml-2">Togo</span>
              </div>
            </div>

            <div className="space-y-2 mb-8">
              <h1 className="text-3xl font-extrabold tracking-tight text-white">Connexion parentale</h1>
              <p className="text-sm leading-6 text-slate-400">Utilisez votre email et mot de passe fournis par l&apos;école pour accéder aux notes, absences et messages.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-slate-400 mb-2">Adresse email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nom@email.com"
                    className="w-full rounded-2xl border border-slate-800 bg-slate-950 py-3 pl-11 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-slate-400 mb-2">Mot de passe</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-2xl border border-slate-800 bg-slate-950 py-3 pl-11 pr-11 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-indigo-300"
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-rose-700/40 bg-rose-950/80 p-3 text-sm text-rose-200"
                >
                  <div className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-rose-300 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                </motion.div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-2xl bg-gradient-to-r from-indigo-500 via-violet-600 to-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-900/25 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Connexion..." : "Se connecter"}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-slate-500">Connexion sécurisée pour les parents d&apos;élèves d&apos;Ecoles Track.</p>
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
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 border-b border-indigo-700 px-4 py-3 flex items-center justify-between shadow-md shrink-0 text-white">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-white/20 rounded-xl flex items-center justify-center shadow-md overflow-hidden">
            <img src={logoImage} alt="Ecoles Track" className="h-6 w-6 object-contain" />
          </div>
          <div>
            <h2 className="text-xs font-black text-white leading-tight">Ecoles Track</h2>
            {/* Multi-school context picker */}
            {parent.schools.length > 1 ? (
              <div className="relative inline-block">
                <select
                  value={activeSchoolId}
                  onChange={(e) => handleSchoolChange(e.target.value)}
                  className="bg-indigo-500/30 hover:bg-indigo-500/50 text-white text-[10px] font-bold py-0.5 px-1.5 rounded flex items-center gap-1 focus:outline-none cursor-pointer border border-white/20"
                >
                  {parent.schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <span className="text-[10px] text-indigo-100 font-medium">{currentSchool?.name}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right block">
            <p className="text-xs font-bold text-white">{parent.name}</p>
            <p className="text-[9px] text-indigo-100">Parent connecté</p>
          </div>
          <button 
            onClick={onLogout}
            className="p-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors border border-white/30"
            title="Se déconnecter"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Main Body - View Switcher */}
      <div className="flex-1 overflow-y-auto p-4 pb-20">
        
        {/* Primary Navigation views */}
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
                        <p className="text-[11px] text-slate-500 font-medium">Date de naissance : {formatBirthDate(currentChild.birthDate)} {currentChild.gender ? `• ${currentChild.gender}` : ""}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Accueil rapide</p>
                          <p className="text-sm font-black text-slate-900 mt-0.5">Assiduité & suivi scolaire</p>
                        </div>
                        <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                          {attendanceRate}% d&apos;assiduité
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-indigo-800 bg-indigo-950/50 p-3">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-indigo-300">Note du trimestre</p>
                          <p className="text-xl font-black text-indigo-100 mt-1">
                            {currentTrimesterAverage ? `${currentTrimesterAverage} / 20` : "-- / 20"}
                          </p>
                          <p className="text-[10px] text-indigo-200/80 font-medium mt-0.5">{currentTrimesterGrades.length} évaluation(s)</p>
                        </div>
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-600">Absences</p>
                          <p className="text-xl font-black text-emerald-900 mt-1">{absenceCount}</p>
                          <p className="text-[10px] text-emerald-700/80 font-medium mt-0.5">sur la période en cours</p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedChild(currentChild);
                            setChildDetailTab("grades");
                            setActiveTab("notes");
                          }}
                          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-left text-slate-100 hover:bg-slate-800 transition-colors"
                        >
                          <div className="text-[9px] font-bold uppercase tracking-wider text-indigo-600">Raccourci</div>
                          <div className="mt-0.5 text-xs font-bold text-slate-900">Notes</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedChild(currentChild);
                            setChildDetailTab("absences");
                            setActiveTab("notifications");
                          }}
                          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-left text-slate-100 hover:bg-slate-800 transition-colors"
                        >
                          <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-600">Raccourci</div>
                          <div className="mt-0.5 text-xs font-bold text-slate-900">Registre d&apos;absence</div>
                        </button>
                      </div>
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
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Absences de l&apos;élève</h3>
                  {currentChild && (
                    <span className="text-[10px] text-indigo-600 font-bold">
                      {currentChild.firstName} {currentChild.lastName}
                    </span>
                  )}
                </div>

                {absences.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400 text-xs font-medium">
                    <Bell className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    Aucune absence enregistrée pour cet élève.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {absences.map((abs) => (
                      <div key={abs.id} className="bg-white border border-slate-100 rounded-2xl p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              {new Date(abs.date).toLocaleDateString("fr-FR")}
                            </p>
                            <h4 className="text-xs font-bold text-slate-800 mt-0.5">Motif : {abs.reason}</h4>
                          </div>
                          {abs.justified ? (
                            <span className="shrink-0 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Justifiée
                            </span>
                          ) : (
                            <span className="shrink-0 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <XCircle className="h-3 w-3" />
                              Injustifiée
                            </span>
                          )}
                        </div>
                        {abs.justified && (
                          <p className="text-[11px] text-slate-600 mt-2 leading-normal font-medium">
                            {abs.justificationText || "Justification validée par l’établissement."}
                          </p>
                        )}
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
                    onClick={() => setAlertMenu("notes")}
                    className={`rounded-xl px-3 py-2 text-[10px] font-bold transition-colors flex items-center justify-center gap-1.5 ${
                      alertMenu === "notes"
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    Notes
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md ${alertMenu === "notes" ? "bg-white/20" : "bg-white"}`}>
                      {notesNotifications.filter((n) => !n.read).length}
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
                    Devoirs à venir
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md ${alertMenu === "homework" ? "bg-white/20" : "bg-white"}`}>
                      {homeworkNotifications.filter((n) => !n.read).length}
                    </span>
                  </button>
                  <button
                    onClick={() => setAlertMenu("absences")}
                    className={`rounded-xl px-3 py-2 text-[10px] font-bold transition-colors flex items-center justify-center gap-1.5 ${
                      alertMenu === "absences"
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    Absences
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md ${alertMenu === "absences" ? "bg-white/20" : "bg-white"}`}>
                      {absenceNotifications.filter((n) => !n.read).length}
                    </span>
                  </button>
                  <button
                    onClick={() => setAlertMenu("info")}
                    className={`rounded-xl px-3 py-2 text-[10px] font-bold transition-colors flex items-center justify-center gap-1.5 ${
                      alertMenu === "info"
                        ? "bg-slate-800 text-white"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    Informations
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md ${alertMenu === "info" ? "bg-white/20" : "bg-white"}`}>
                      {infoNotifications.filter((n) => !n.read).length}
                    </span>
                  </button>
                </div>

                {visibleAlertNotifications.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400 text-xs font-medium">
                    <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                    {alertMenu === "notes" && "Aucune alerte de notes publiée pour le moment."}
                    {alertMenu === "homework" && "Aucune alerte de devoirs à venir pour le moment."}
                    {alertMenu === "absences" && "Aucune alerte d'absence pour le moment."}
                    {alertMenu === "info" && "Aucune information à afficher pour le moment."}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {visibleAlertNotifications.map((notif) => (
                      <div
                        key={notif.id}
                        role="button"
                        tabIndex={0}
                        onClick={async () => {
                          console.log("Notification click:", notif.id, "read?", notif.read);
                          const firstChild = children[0];
                          if (firstChild) {
                            setSelectedChild(firstChild);
                            setChildDetailTab("grades");
                          }
                          await handleMarkNotificationRead(notif);
                        }}
                        onKeyDown={async (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            console.log("Notification key activate:", notif.id, "read?", notif.read);
                            const firstChild = children[0];
                            if (firstChild) {
                              setSelectedChild(firstChild);
                              setChildDetailTab("grades");
                            }
                            await handleMarkNotificationRead(notif);
                          }
                        }}
                        className={`bg-white border rounded-2xl p-3 shadow-sm text-left relative cursor-pointer transition-all ${
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
                          <AlertTriangle className={`h-3.5 w-3.5 ${alertMenu === "notes" ? "text-indigo-500" : alertMenu === "homework" ? "text-amber-500" : alertMenu === "absences" ? "text-emerald-500" : "text-slate-500"}`} />
                          {notif.title}
                        </h4>
                        <p className="text-[11px] text-slate-600 mt-1 leading-normal font-medium">{notif.message}</p>
                        <div className="mt-3">
                          <span className={`text-[10px] font-bold ${notif.read ? 'text-slate-400' : 'text-indigo-600'}`}>
                            {notif.read ? 'Message déjà lu' : 'Nouveau message'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}


            {activeTab === "notes" && (
              <motion.div 
                key="notes"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Notes</h3>
                      <p className="text-[11px] text-slate-400 mt-1">Dernières notes publiées pour l'enfant sélectionné.</p>
                    </div>
                    <Award className="h-5 w-5 text-indigo-300 shrink-0" />
                  </div>

                  {currentChild ? (
                    grades.length === 0 ? (
                      <div className="py-8 text-center text-slate-400 text-xs font-medium">Aucune note disponible pour l'élève sélectionné.</div>
                    ) : (
                      <div className="space-y-3 mt-4">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div>
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Historique des évaluations</h4>
                            {displayedGradesAverage && (
                              <p className="text-[9px] text-slate-400 mt-1">Moyenne: {displayedGradesAverage} / 20</p>
                            )}
                          </div>
                          <span className="text-[9px] font-bold text-slate-100 bg-slate-800 px-2 py-0.5 rounded-md">
                            {displayedGrades.length} note(s)
                          </span>
                        </div>

                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="flex items-center justify-between gap-2">
                            <label htmlFor="grade-subject-filter" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                              Matiere
                            </label>
                            <select
                              id="grade-subject-filter"
                              value={gradeSubjectFilter}
                              onChange={(e) => setGradeSubjectFilter(e.target.value)}
                              className="bg-slate-900 border border-slate-700 rounded-lg py-1.5 px-2 text-[10px] font-semibold text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full max-w-[190px]"
                            >
                              <option value="all">Toutes les matieres</option>
                              {availableGradeSubjects.map((subject) => (
                                <option key={subject} value={subject}>{subject}</option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <label htmlFor="grade-period-filter" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                              Periode
                            </label>
                            <select
                              id="grade-period-filter"
                              value={gradePeriodFilter}
                              onChange={(e) => setGradePeriodFilter(e.target.value as "all" | "7d" | "30d" | "trimester")}
                              className="bg-slate-900 border border-slate-700 rounded-lg py-1.5 px-2 text-[10px] font-semibold text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full max-w-[190px]"
                            >
                              <option value="all">Toute periode</option>
                              <option value="7d">7 derniers jours</option>
                              <option value="30d">30 derniers jours</option>
                              <option value="trimester">Trimestre</option>
                            </select>
                          </div>
                        </div>

                        {displayedGrades.length === 0 ? (
                          <div className="text-center py-6 text-slate-400 text-xs font-medium">Aucune note pour ce filtre matiere/periode.</div>
                        ) : (
                          <div className="space-y-3">
                            {displayedGrades.map((g) => {
                              const tone = getGradeToneClasses(g.grade, g.maxScore);

                              return (
                                <div key={g.id} className={`rounded-2xl border p-3 ${tone.card}`}>
                                  <div className="flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                      <p className={`text-[10px] font-bold uppercase tracking-wider ${tone.title}`}>{g.subject}</p>
                                      <h4 className="text-sm font-black text-slate-100 truncate">{g.examName}</h4>
                                      <p className="text-[10px] text-slate-400 mt-0.5">Le {new Date(g.date).toLocaleDateString("fr-FR")}</p>
                                    </div>
                                    <div className="text-right">
                                      <p className={`text-xl font-black ${tone.value}`}>{`${g.grade} / ${g.maxScore ?? 20}`}</p>
                                      <p className={`text-[9px] ${tone.meta}`}>coeff {g.coefficient}</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    <div className="py-8 text-center text-slate-400 text-xs font-medium">Sélectionnez un enfant pour afficher ses notes.</div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
          onClick={() => handleNavigateTab("notes")}
          className={`flex-1 flex flex-col items-center gap-1 py-1 text-[9px] font-bold ${
            activeTab === "notes" ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <Award className="h-4.5 w-4.5" />
          <span>Notes</span>
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
          <span>Absences</span>
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
      </div>
    </div>
  );
}
