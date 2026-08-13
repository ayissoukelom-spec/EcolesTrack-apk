/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  Lock, Mail, LogOut, User, Award, Calendar, Bell, Shield, 
  CheckCircle2, XCircle, ChevronRight, School, Eye, EyeOff, AlertTriangle 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import logoImage from "../assets/logo.png";
import ThemeToggle from "./ThemeToggle";
import { Parent, Child, Absence, Grade, AppNotification } from "../types";
import { getApiErrorMessage, parseJsonSafe, withApiBase } from "../utils/http";

interface ParentPortalProps {
  token: string | null;
  parent: Parent | null;
  onLoginSuccess: (token: string, parent: Parent, refreshToken: string) => void;
  onLogout: () => void;
  refreshAccessToken: () => Promise<string | null>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedChild: Child | null;
  setSelectedChild: (child: Child | null) => void;
  notifications: AppNotification[];
  fetchNotifications: () => void;
  notificationAlertMenu?: "notes" | "homework" | "absences" | "info" | null;
}

export default function ParentPortal({
  token,
  parent,
  onLoginSuccess,
  onLogout,
  refreshAccessToken,
  activeTab,
  setActiveTab,
  selectedChild,
  setSelectedChild,
  notifications,
  fetchNotifications,
  notificationAlertMenu
}: ParentPortalProps) {
  // APK debug: log incoming props
  console.log('[APK DEBUG] ParentPortal props', JSON.stringify({ notifications }, null, 2));
  
  // Login credentials state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [childrenLoadError, setChildrenLoadError] = useState<string | null>(null);
  const [passwordResetRequired, setPasswordResetRequired] = useState(false);
  const [pendingResetEmail, setPendingResetEmail] = useState("");
  const [pendingResetCurrentPassword, setPendingResetCurrentPassword] = useState("");
  const [pendingResetNewPassword, setPendingResetNewPassword] = useState("");
  const [pendingResetConfirmPassword, setPendingResetConfirmPassword] = useState("");
  const [passwordResetError, setPasswordResetError] = useState<string | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Parent app active state loaded from endpoints
  const [children, setChildren] = useState<Child[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [termAverageApi, setTermAverageApi] = useState<number | null>(null);

  const [activeSchoolId, setActiveSchoolId] = useState("");
  const [localNotifications, setLocalNotifications] = useState<AppNotification[]>(notifications);
  const [markingNotificationIds, setMarkingNotificationIds] = useState<string[]>([]);
  const [readOverrides, setReadOverrides] = useState<Set<string>>(new Set());
  const hasCompletedProtectedLoadRef = useRef(false);

  // Keep a local copy of notifications so the badge updates immediately.
  useEffect(() => {
    const mapped = notifications.map((notif) => ({
      ...notif,
      read: notif.read || readOverrides.has(notif.id)
    }));
    console.log('[APK DEBUG] localNotifications (before set)', JSON.stringify(mapped, null, 2));
    setLocalNotifications(mapped);
  }, [notifications, readOverrides]);

  // Sub-tab inside child details (Notes vs Absences)
  const [childDetailTab, setChildDetailTab] = useState<"grades" | "absences">("grades");
  const [alertMenu, setAlertMenu] = useState<"notes" | "homework" | "absences" | "info">("notes");

  useEffect(() => {
    if (notificationAlertMenu) {
      console.log("[PARENTPORTAL_DEBUG] notificationAlertMenu changed:", notificationAlertMenu);
      setActiveTab("alerts");
      setAlertMenu(notificationAlertMenu);
    }
  }, [notificationAlertMenu, setActiveTab]);
  const [gradeSubjectFilter, setGradeSubjectFilter] = useState("all");
  const [gradePeriodFilter, setGradePeriodFilter] = useState<"all" | "7d" | "30d" | "trimester">("all");
  const [showJustificationModal, setShowJustificationModal] = useState<Absence | null>(null);
  const [justificationReason, setJustificationReason] = useState("");
  const [isJustifying, setIsJustifying] = useState(false);
  const [justificationError, setJustificationError] = useState<string | null>(null);

  const handleSessionExpired = () => {
    if (!hasCompletedProtectedLoadRef.current) {
      return;
    }

    setChildren([]);
    setAbsences([]);
    setGrades([]);
    setTermAverageApi(null);
    setChildrenLoadError(null);
    onLogout();
  };

  const performProtectedRequest = async (requestFactory: (authToken: string) => Promise<Response>) => {
    let authToken = token;
    if (!authToken) {
      authToken = await refreshAccessToken();
      if (!authToken) {
        handleSessionExpired();
        return null;
      }
    }

    try {
      let response = await requestFactory(authToken);
      if (response.status === 401) {
        const refreshedToken = await refreshAccessToken();
        if (!refreshedToken) {
          handleSessionExpired();
          return null;
        }

        authToken = refreshedToken;
        response = await requestFactory(authToken);
      }
      if (response.status === 403) {
        handleSessionExpired();
        return null;
      }
      return response;
    } catch (e) {
      console.error("[AUTH_DEBUG] Protected request failed", e);
      return null;
    }
  };

  // Load children list when authenticated
  const parentId = parent?.id;
  const parentActiveSchoolId = parent?.activeSchoolId;
  useEffect(() => {
    if (!token || !parentId) {
      hasCompletedProtectedLoadRef.current = false;
      return;
    }

    fetchChildren();
    if (parentActiveSchoolId) {
      setActiveSchoolId(parentActiveSchoolId);
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
      return [...subjectFiltered].sort((a, b) => new Date(b.publishedAt ?? b.date).getTime() - new Date(a.publishedAt ?? a.date).getTime());
    }

    const now = Date.now();
    const days = gradePeriodFilter === "7d" ? 7 : gradePeriodFilter === "30d" ? 30 : 90;
    const threshold = now - (days * 24 * 60 * 60 * 1000);

    return subjectFiltered
      .filter((g) => new Date(g.date).getTime() >= threshold)
      .sort((a, b) => new Date(b.publishedAt ?? b.date).getTime() - new Date(a.publishedAt ?? a.date).getTime());
  }, [grades, gradeSubjectFilter, gradePeriodFilter]);

  const displayedGradesAverage = (gradePeriodFilter === "trimester" && termAverageApi != null)
    ? termAverageApi.toFixed(2)
    : calculateAverage(displayedGrades);

  const getGradeToneClasses = (grade: number, maxScore?: number) => {
    const normalizedScore = (maxScore && maxScore > 0 && grade <= maxScore) ? (grade / maxScore) * 20 : grade;

    if (normalizedScore < 10) {
      return {
        card: "border-rose-300/80 bg-rose-50/90 dark:border-rose-800/70 dark:bg-rose-950/40",
        title: "text-rose-700 dark:text-rose-300",
        value: "text-rose-700 dark:text-rose-200",
        meta: "text-rose-600 dark:text-rose-400"
      };
    }

    if (normalizedScore < 14) {
      return {
        card: "border-amber-300/80 bg-amber-50/90 dark:border-amber-800/70 dark:bg-amber-950/40",
        title: "text-amber-700 dark:text-amber-200",
        value: "text-amber-700 dark:text-amber-200",
        meta: "text-amber-600 dark:text-amber-300"
      };
    }

    return {
      card: "border-emerald-300/80 bg-emerald-50/90 dark:border-emerald-800/70 dark:bg-emerald-950/40",
      title: "text-emerald-700 dark:text-emerald-300",
      value: "text-emerald-700 dark:text-emerald-200",
      meta: "text-emerald-600 dark:text-emerald-400"
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

      const data = await parseJsonSafe<{ token?: string; parent?: Parent; refreshToken?: string; error?: string; mustReset?: boolean; }>(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, "Une erreur est survenue lors de la connexion."));
      }

      if (!data?.token || !data?.parent || !data?.refreshToken) {
        throw new Error("Le serveur a renvoye une reponse incomplete. Verifiez la connexion API.");
      }

      if (data.mustReset) {
        setPasswordResetRequired(true);
        setPendingResetEmail(loginEmail);
        setPendingResetCurrentPassword("");
        setPendingResetNewPassword("");
        setPendingResetConfirmPassword("");
        setErrorMsg("Votre compte nécessite un changement de mot de passe avant de continuer.");
        return;
      }

      // Success
      onLoginSuccess(data.token, data.parent, data.refreshToken);
      setEmail("");
      setPassword("");
    } catch (err: any) {
      console.error("[LOGIN ERROR]", err);
      setErrorMsg(err.message || "Erreur de connexion");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setPasswordResetError(null);

    if (!pendingResetEmail || !pendingResetCurrentPassword) {
      setPasswordResetError("Les informations de connexion sont manquantes.");
      return;
    }

    if (!pendingResetNewPassword.trim()) {
      setPasswordResetError("Veuillez saisir un nouveau mot de passe.");
      return;
    }

    if (pendingResetNewPassword !== pendingResetConfirmPassword) {
      setPasswordResetError("Les mots de passe ne correspondent pas.");
      return;
    }

    setIsResettingPassword(true);
    try {
      const response = await fetch(withApiBase("/api/mobile/parent/change-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: pendingResetEmail,
          currentPassword: pendingResetCurrentPassword,
          newPassword: pendingResetNewPassword
        })
      });

      const data = await parseJsonSafe<{ success?: boolean; error?: string }>(response);
      if (!response.ok || !data?.success) {
        throw new Error(getApiErrorMessage(data, "Impossible de changer le mot de passe."));
      }

      setPasswordResetRequired(false);
      setErrorMsg(null);
      setPasswordResetError(null);
      setPassword("");
      setPendingResetCurrentPassword("");
      setPendingResetNewPassword("");
      setPendingResetConfirmPassword("");

      await handleLogin(undefined, pendingResetEmail, pendingResetNewPassword);
    } catch (err: any) {
      console.error("[PASSWORD RESET ERROR]", err);
      setPasswordResetError(err.message || "Impossible de changer le mot de passe.");
    } finally {
      setIsResettingPassword(false);
    }
  };

  // API Call: Fetch Children
  const fetchChildren = async () => {
    setChildrenLoadError(null);
    try {
      console.log("[AUTH_DEBUG] fetchChildren starting", { tokenPresent: !!token, tokenLength: token?.length });
      const response = await performProtectedRequest((authToken) => fetch(withApiBase("/api/mobile/parent/children"), {
        headers: { "Authorization": `Bearer ${authToken}` }
      }));
      if (!response) {
        return;
      }
      const data = await parseJsonSafe<Child[] | { error?: string }>(response);
      if (response.ok) {
        hasCompletedProtectedLoadRef.current = true;
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
      console.log("[AUTH_DEBUG] handleSimulateChild starting", { tokenPresent: !!token, tokenLength: token?.length });
      const response = await performProtectedRequest((authToken) => fetch(withApiBase("/api/mobile/parent/children/simulate"), {
        method: "POST",
        headers: { "Authorization": `Bearer ${authToken}` }
      }));
      if (!response) {
        return;
      }
      if (response.ok) {
        fetchChildren();
      }
    } catch (e) {
      console.error("Failed to simulate child", e);
    }
  };

  const handleOpenJustificationModal = (absence: Absence) => {
    setJustificationError(null);
    setJustificationReason("");
    setShowJustificationModal(absence);
  };

  const handleCloseJustificationModal = () => {
    setShowJustificationModal(null);
    setJustificationError(null);
    setJustificationReason("");
  };

  const submitAbsenceJustification = async () => {
    if (!showJustificationModal) return;
    if (!justificationReason.trim()) {
      setJustificationError("Veuillez saisir un motif de justification.");
      return;
    }

    if (!token) {
      setJustificationError("Session invalide. Veuillez vous reconnecter.");
      return;
    }

    setIsJustifying(true);
    setJustificationError(null);

    try {
      const response = await performProtectedRequest((authToken) => fetch(withApiBase(`/api/absences/${showJustificationModal.id}/justify`), {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${authToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ justificationReason: justificationReason.trim() })
      }));

      if (!response) {
        throw new Error("Impossible de justifier l'absence pour le moment.");
      }
      const data = await parseJsonSafe(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, "Impossible de justifier l'absence."));
      }

      await fetchChildAbsences(String(showJustificationModal.childId));
      handleCloseJustificationModal();
    } catch (err: any) {
      console.error("[APK JUSTIFY ERROR]", err);
      setJustificationError(err?.message || "Erreur lors de la justification.");
    } finally {
      setIsJustifying(false);
    }
  };

  // API Call: Fetch Child Absences
  const fetchChildAbsences = async (childId: string) => {
    try {
      console.log("[AUTH_DEBUG] fetchChildAbsences starting", { childId, tokenPresent: !!token, tokenLength: token?.length });
      const response = await performProtectedRequest((authToken) => fetch(withApiBase(`/api/mobile/parent/children/${childId}/absences`), {
        headers: { "Authorization": `Bearer ${authToken}` }
      }));
      if (!response) {
        return;
      }
      if (response.ok) {
        hasCompletedProtectedLoadRef.current = true;
        const data = await parseJsonSafe<Absence[]>(response);
        // Sort absences by date descending (most recent first)
        const sortedAbsences = Array.isArray(data)
          ? [...data].sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();

        if (dateDiff !== 0) {
        return dateDiff;
      }

      return Number(b.id) - Number(a.id);
    })
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
      const response = await performProtectedRequest((authToken) => fetch(withApiBase(`/api/mobile/parent/children/${childId}/grades`), {
        headers: { "Authorization": `Bearer ${authToken}` }
      }));
      if (!response) {
        return;
      }
      const serverAverageHeader = response.headers.get('X-Student-Term-Average');
      if (response.ok) {
        hasCompletedProtectedLoadRef.current = true;
        const data = await parseJsonSafe<{ grades?: Grade[]; termAverage?: number }>(response);
        const gradesData = Array.isArray((data as any)) ? (data as any) : (data && Array.isArray((data as any).grades) ? (data as any).grades : []);
        console.log("[APK DEBUG] Grades received from API:", gradesData.length, "items");
        // Determine average from body or header
        const bodyAverage = (data && (data as any).termAverage != null) ? Number((data as any).termAverage) : null;
        const headerAverage = serverAverageHeader ? Number(serverAverageHeader) : null;
        const chosenAverage = bodyAverage != null ? bodyAverage : headerAverage;
        if (chosenAverage != null) {
          console.log(`[APK DEBUG] Average received from API: ${chosenAverage}`);
          setTermAverageApi(chosenAverage);
        } else {
          setTermAverageApi(null);
        }

        try {
          const trimesterGrades = gradesData.filter((gd: any) => {
            try { return new Date(gd.date).getTime() >= trimesterStart.getTime(); } catch { return false; }
          });

          const studentName = currentChild ? `${currentChild.firstName} ${currentChild.lastName}` : 'unknown';
          const displayedAverage = (gradePeriodFilter === 'trimester' && chosenAverage != null)
            ? Number(chosenAverage).toFixed(2)
            : (calculateAverage(trimesterGrades) ?? '—');

          console.log('[DEBUG AVERAGE] START');
          console.log('[DEBUG AVERAGE] childId:', childId);
          console.log('[DEBUG AVERAGE] student:', studentName);
          console.log('[DEBUG AVERAGE] serverAverage:', chosenAverage != null ? Number(chosenAverage).toFixed(2) : 'null');
          console.log('[DEBUG AVERAGE] displayedAverage:', displayedAverage);

          trimesterGrades.forEach((g: any) => {
            const raw = typeof g.rawScore === 'number' ? g.rawScore : g.grade;
            const max = g.maxScore ?? 20;
            const coeff = g.coefficient ?? 1;
            const normalized = typeof g.grade === 'number' ? Number(g.grade.toFixed(2)) : null;
            console.log(
              '[DEBUG AVERAGE] GRADE:',
              g.subject,
              'raw:', raw,
              'max:', max,
              'coef:', coeff,
              'normalized:', normalized
            );
          });

          console.log('[DEBUG AVERAGE] END');
        } catch (e) {
          console.log('Failed to print DEBUG AVERAGE block', String(e));
        }

        setGrades(gradesData);
      }
    } catch (e) {
      console.error("Failed to fetch grades", e);
    }
  };

  // Helper API Call: Register FCM token
  const registerMockToken = async () => {
    try {
      const response = await performProtectedRequest((authToken) => fetch(withApiBase("/api/mobile/parent/devices/register-push-token"), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${authToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          pushToken: `fcm-token-${parent?.id}-${crypto.randomUUID().slice(0, 6)}`,
          platform: "android",
          appVersion: "2.4.1"
        })
      }));
      if (!response) {
        return;
      }
    } catch (e) {
      console.log("Mock token registration handled");
    }
  };

  // Calculate Weighted Average
  function calculateAverage(studentGrades: Grade[]) {
    if (studentGrades.length === 0) return null;
    let totalScore = 0;
    let totalCoeff = 0;
    const debugInfo: any[] = [];
    
    studentGrades.forEach(g => {
      const weightedScore = g.grade * g.coefficient;
      totalScore += weightedScore;
      totalCoeff += g.coefficient;
      debugInfo.push({
        subject: g.subject,
        grade: g.grade,
        rawScore: (g as any).rawScore,
        maxScore: g.maxScore,
        coefficient: g.coefficient,
        weightedScore: weightedScore,
        date: g.date
      });
    });
    
    const average = (totalScore / totalCoeff).toFixed(2);
    console.log("[APK DEBUG] Trimester average calculation:", JSON.stringify({
      gradesCount: studentGrades.length,
      totalScore,
      totalCoeff,
      average,
      details: debugInfo
    }, null, 2));
    
    return average;
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
  const unjustifiedAbsenceCount = currentTrimesterAbsences.filter((abs) => !abs.justified).length;
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

  const currentTrimesterAverage = termAverageApi != null ? termAverageApi.toFixed(2) : calculateAverage(currentTrimesterGrades);
  
  // Debug: Log current trimester info
  console.log("[APK DEBUG] Trimester filter info:", JSON.stringify({
    trimesterStart: trimesterStart.toISOString(),
    currentDate: new Date().toISOString(),
    totalGradesCount: grades.length,
    trimesterGradesCount: currentTrimesterGrades.length,
    trimesterGrades: currentTrimesterGrades.map(g => ({
      subject: g.subject,
      grade: g.grade,
      rawScore: (g as any).rawScore,
      coefficient: g.coefficient,
      date: g.date,
      inRange: new Date(g.date).getTime() >= trimesterStart.getTime()
    }))
  }, null, 2));
  
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
    console.log('[PARENTPORTAL_DEBUG] handleNavigateTab called with tab:', tab, 'notificationAlertMenu:', notificationAlertMenu);
    setActiveTab(tab);
  };

  const handleSelectChild = (child: Child) => {
    setSelectedChild(child);
    setChildDetailTab("grades");
  };

  const handleReadAllNotifications = async () => {
    const response = await performProtectedRequest((authToken) => fetch(withApiBase("/api/mobile/parent/notifications/read-all"), {
      method: "PUT",
      headers: { "Authorization": `Bearer ${authToken}` }
    }));
    if (!response) {
      return;
    }

    try {
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
      const response = await performProtectedRequest((authToken) => fetch(withApiBase(`/api/mobile/parent/notifications/${notif.id}/read`), {
        method: "PUT",
        headers: { "Authorization": `Bearer ${authToken}` }
      }));
      if (!response) {
        throw new Error(`Impossible de marquer la notification ${notif.id} comme lue.`);
      }
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
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen px-4 py-4 sm:py-8 theme-bg theme-text overflow-y-auto" id="login-screen">
        <div className="w-full max-w-md">
          <div className="rounded-[2rem] border theme-border theme-card p-6 sm:p-7 shadow-2xl shadow-indigo-900/20 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="flex flex-col items-center gap-4 mb-6 text-center">
              <img
                src={logoImage}
                alt="Ecoles Track"
                className="mx-auto h-20 w-20 rounded-3xl object-contain shadow-lg shadow-indigo-900/20"
              />
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Ecoles Track</h1>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Portail parents</p>
              </div>
            </div>
            <div className="space-y-3 mb-7">
              <div className="inline-flex items-center justify-center rounded-full theme-panel px-3 py-2 text-xs font-semibold theme-text-primary ring-1 theme-border">
                <span className="text-lg">🇹🇬</span>
                <span className="ml-2">Togo</span>
              </div>
            </div>

            <div className="space-y-2 mb-6">
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {passwordResetRequired ? 'Changement de mot de passe requis' : 'Connexion parentale'}
              </h1>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">
                {passwordResetRequired
                  ? 'Pour continuer, veuillez définir un nouveau mot de passe sécurisé.'
                  : 'Utilisez votre email et mot de passe fournis par l\'école pour accéder aux notes, absences et messages.'}
              </p>
            </div>

            {passwordResetRequired ? (
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-slate-700 dark:text-slate-300 mb-2">Adresse email</label>
                  <input
                    type="email"
                    value={pendingResetEmail}
                    onChange={(e) => setPendingResetEmail(e.target.value)}
                    placeholder="nom@email.com"
                    className="w-full rounded-2xl border theme-border theme-input py-3 px-4 text-sm theme-text-primary shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-slate-700 dark:text-slate-300 mb-2">Mot de passe actuel</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500 dark:text-slate-400" />
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      value={pendingResetCurrentPassword}
                      onChange={(e) => setPendingResetCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-2xl border theme-border theme-input py-3 pl-11 pr-11 text-sm theme-text-primary shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword((prev) => !prev)}
                      className="absolute right-3 top-3 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                      aria-label={showCurrentPassword ? "Masquer le mot de passe actuel" : "Afficher le mot de passe actuel"}
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-slate-700 dark:text-slate-300 mb-2">Nouveau mot de passe</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500 dark:text-slate-400" />
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={pendingResetNewPassword}
                      onChange={(e) => setPendingResetNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-2xl border theme-border theme-input py-3 pl-11 pr-11 text-sm theme-text-primary shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      className="absolute right-3 top-3 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                      aria-label={showNewPassword ? "Masquer le nouveau mot de passe" : "Afficher le nouveau mot de passe"}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-slate-700 dark:text-slate-300 mb-2">Confirmer le nouveau mot de passe</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500 dark:text-slate-400" />
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={pendingResetConfirmPassword}
                      onChange={(e) => setPendingResetConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-2xl border theme-border theme-input py-3 pl-11 pr-11 text-sm theme-text-primary shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="absolute right-3 top-3 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                      aria-label={showConfirmPassword ? "Masquer la confirmation du mot de passe" : "Afficher la confirmation du mot de passe"}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {(passwordResetError || errorMsg) && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-rose-300/80 bg-rose-50/90 p-3 text-sm text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/50 dark:text-rose-200"
                  >
                    <div className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-300 mt-0.5" />
                      <span>{passwordResetError || errorMsg}</span>
                    </div>
                  </motion.div>
                )}

                <div className="flex flex-col gap-3">
                  <button
                    type="submit"
                    disabled={isResettingPassword}
                    className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-900/20 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isResettingPassword ? "Mise à jour..." : "Changer le mot de passe"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordResetRequired(false);
                      setPendingResetEmail("");
                      setPendingResetCurrentPassword("");
                      setPendingResetNewPassword("");
                      setPendingResetConfirmPassword("");
                      setPassword("");
                      setErrorMsg(null);
                      setPasswordResetError(null);
                    }}
                    className="w-full rounded-2xl border border-slate-300/80 bg-slate-100 text-slate-900 px-5 py-3 text-sm font-bold transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-slate-700 dark:text-slate-300 mb-2">Adresse email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500 dark:text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nom@email.com"
                      className="w-full rounded-2xl border theme-border theme-input py-3 pl-11 pr-4 text-sm theme-text-primary shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-slate-700 dark:text-slate-300 mb-2">Mot de passe</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500 dark:text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-2xl border theme-border theme-input py-3 pl-11 pr-11 text-sm theme-text-primary shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                      aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {errorMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-rose-300/80 bg-rose-50/90 p-3 text-sm text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/50 dark:text-rose-200"
                  >
                    <div className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-300 mt-0.5" />
                      <span>{errorMsg}</span>
                    </div>
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-900/20 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? "Connexion..." : "Se connecter"}
                </button>
              </form>
            )}

            <p className="mt-6 text-center text-xs text-slate-600 dark:text-slate-400">Connexion sécurisée pour les parents d&apos;élèves d&apos;Ecoles Track.</p>
          </div>
        </div>
      </div>
    );
  }

  // Active School Metadata object
  const currentSchool = parent.schools.find(s => s.id === activeSchoolId) || parent.schools[0];

  // Screen B: LOGGED IN PORTAL VIEWPORT
  return (
    <div className="h-screen flex flex-col theme-bg theme-text overflow-hidden" id="portal-logged-in">
      
      {/* Dynamic Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 border-b theme-border px-4 py-3 flex items-center justify-between shadow-md shrink-0 text-white">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-white/20 rounded-xl flex items-center justify-center shadow-md overflow-hidden">
            <img src={logoImage} alt="Ecoles Track" className="h-6 w-6 object-contain" />
          </div>
          <div>
            <h2 className="text-xs font-black text-white leading-tight">Ecoles Track</h2>
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
          <ThemeToggle />
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
                  <div className="theme-card rounded-2xl border theme-border p-4 shadow-sm space-y-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={currentChild.avatarUrl}
                        alt={currentChild.firstName}
                        className="h-14 w-14 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Actif</div>
                        <h4 className="text-sm font-black text-slate-900 dark:text-white truncate">{currentChild.firstName} {currentChild.lastName}</h4>
                        <p className="text-[11px] text-slate-700 dark:text-slate-300 font-medium">Classe : {currentChild.className}</p>
                        <p className="text-[11px] text-slate-700 dark:text-slate-300 font-medium">Date de naissance : {formatBirthDate(currentChild.birthDate)} {currentChild.gender ? `• ${currentChild.gender}` : ""}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Accueil rapide</p>
                          <p className="text-sm font-black text-slate-900 dark:text-white mt-0.5">Assiduité & suivi scolaire</p>
                        </div>
                        <div className="rounded-full bg-emerald-100 dark:bg-emerald-950/70 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                          {attendanceRate}% d&apos;assiduité
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/90 dark:bg-indigo-950/60 p-3">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Note du trimestre</p>
                          <p className="text-xl font-black text-indigo-900 dark:text-indigo-100 mt-1">
                            {currentTrimesterAverage ? `${currentTrimesterAverage} / 20` : "-- / 20"}
                          </p>
                          <p className="text-[10px] text-indigo-700/80 dark:text-indigo-300/80 font-medium mt-0.5">{currentTrimesterGrades.length} évaluation(s)</p>
                        </div>
                        <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/90 dark:bg-rose-950/50 p-3">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">Assiduité</p>
                          <div className="flex items-baseline gap-2 mt-2">
                            <p className="text-3xl font-black text-rose-700 dark:text-rose-300">{absenceCount}</p>
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">absences</p>
                          </div>
                          <p className="text-[10px] text-slate-700 dark:text-slate-300 font-medium mt-2">{unjustifiedAbsenceCount} non justifiées</p>
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
                          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-left text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <div className="text-[9px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Raccourci</div>
                          <div className="mt-0.5 text-xs font-bold text-slate-900 dark:text-white">Notes</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedChild(currentChild);
                            setChildDetailTab("absences");
                            setActiveTab("notifications");
                          }}
                          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-left text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Raccourci</div>
                          <div className="mt-0.5 text-xs font-bold text-slate-900 dark:text-white">Registre d&apos;absence</div>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <h3 className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Sélection de l&apos;élève</h3>
                {childrenLoadError && (
                  <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl p-2.5 text-[11px] text-rose-700 dark:text-rose-300 font-semibold">
                    {childrenLoadError}
                  </div>
                )}
                {children.length === 0 ? (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 text-center">
                    <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold">Aucun enfant rattaché pour ce compte.</p>
                    <div className="mt-3 flex items-center justify-center gap-2">
                      <button
                        onClick={fetchChildren}
                        className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-[11px] font-bold px-3 py-2 rounded-lg"
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
                  <div className="theme-card rounded-2xl border theme-border p-2 shadow-sm space-y-1.5">
                    {children.length > 1 && (
                      <p className="px-2 pt-1 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
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
                              ? "border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-100"
                              : "border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/70 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-700 dark:hover:bg-slate-800"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold truncate">{child.firstName} {child.lastName}</div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isActiveChild && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-700 bg-white px-2 py-0.5 rounded-md border border-indigo-200 dark:text-indigo-300 dark:bg-slate-900 dark:border-indigo-700">
                                Actif
                              </span>
                            )}
                            <ChevronRight className={`h-4 w-4 ${isActiveChild ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400"}`} />
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
                <AnimatePresence>
                  {showJustificationModal && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70"
                    >
                      <motion.div
                        initial={{ y: 12, opacity: 0, scale: 0.98 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 12, opacity: 0, scale: 0.98 }}
                        className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-100 p-6 shadow-2xl shadow-slate-950/20 dark:border-slate-800 dark:bg-slate-950"
                      >
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div>
                            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Justifier l'absence</h2>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                              {currentChild ? `${currentChild.firstName} ${currentChild.lastName}` : "Motif de l'absence"}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleCloseJustificationModal}
                            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                          >
                            Fermer
                          </button>
                        </div>
                        <textarea
                          value={justificationReason}
                          onChange={(event) => setJustificationReason(event.target.value)}
                          placeholder="Décrivez le motif de justification..."
                          rows={5}
                          className="w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-500/30"
                        />
                        {justificationError && (
                          <div className="mt-3 rounded-2xl border border-rose-300 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                            {justificationError}
                          </div>
                        )}
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                          <button
                            type="button"
                            onClick={handleCloseJustificationModal}
                            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            onClick={submitAbsenceJustification}
                            disabled={isJustifying}
                            className="rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
                          >
                            {isJustifying ? "Envoi..." : "Envoyer la justification"}
                          </button>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
                                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Absences de l&apos;élève</h3>
                  {currentChild && (
                    <span className="text-[10px] text-indigo-700 dark:text-indigo-400 font-bold">
                      {currentChild.firstName} {currentChild.lastName}
                    </span>
                  )}
                </div>

                {absences.length === 0 ? (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center text-slate-700 dark:text-slate-300 text-xs font-medium">
                    <Bell className="h-8 w-8 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
                    Aucune absence enregistrée pour cet élève.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {absences.map((abs) => (
                      <div key={abs.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                              {new Date(abs.date).toLocaleDateString("fr-FR")}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
  Matière : {abs.subjectName || abs.subject || 'Non précisée'}
</p>

<p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
  {abs.startTime && abs.endTime
    ? `${abs.startTime} - ${abs.endTime}`
    : abs.period || 'Horaire non précisé'}
</p>

<h4 className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">
  Motif : {abs.reason}
</h4>
                          </div>
                          {abs.justified ? (
                            <span className="shrink-0 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Justifiée
                            </span>
                          ) : (
                            <span className="shrink-0 text-[10px] font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <XCircle className="h-3 w-3" />
                              Injustifiée
                            </span>
                          )}
                        </div>
                        {abs.justified && (
                          <p className="text-[11px] text-slate-700 dark:text-slate-300 mt-2 leading-normal font-medium">
                            {abs.justificationText || "Justification validée par l’établissement."}
                          </p>
                        )}
                        {!abs.justified && (
                          <button
                            type="button"
                            onClick={() => handleOpenJustificationModal(abs)}
                            className="mt-3 w-full rounded-xl bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wide py-2 transition-colors hover:bg-indigo-700"
                          >
                            Justifier cette absence
                          </button>
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
                <div className="rounded-3xl border border-slate-200/90 bg-gradient-to-br from-slate-50 via-white to-indigo-50/70 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:from-slate-900/90 dark:via-slate-900/95 dark:to-indigo-950/40">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 shadow-sm dark:bg-indigo-950/70 dark:text-indigo-300">
                      <AlertTriangle className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-900 dark:text-slate-100">
                        Centre d&apos;alertes parentales
                      </h3>
                      <p className="mt-1 text-[10px] font-medium leading-relaxed text-slate-700 dark:text-slate-300">
                        Les alertes sont séparées par type pour distinguer les notes publiées, les devoirs à venir et les informations importantes.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/90 bg-slate-50/90 p-1.5 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => setAlertMenu("notes")}
                      className={`rounded-xl px-3 py-2 text-[10px] font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 ${
                        alertMenu === "notes"
                          ? "border border-indigo-200 bg-indigo-50/90 text-slate-900 shadow-sm dark:border-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-100"
                          : "bg-transparent text-slate-700 hover:bg-indigo-50/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      }`}
                    >
                      Notes
                      <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${alertMenu === "notes" ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/70 dark:text-indigo-200" : "bg-white/90 text-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}>
                        {notesNotifications.filter((n) => !n.read).length}
                      </span>
                    </button>
                    <button
                      onClick={() => setAlertMenu("homework")}
                      className={`rounded-xl px-3 py-2 text-[10px] font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 ${
                        alertMenu === "homework"
                          ? "border border-amber-200 bg-amber-50/90 text-slate-900 shadow-sm dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
                          : "bg-transparent text-slate-700 hover:bg-amber-50/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      }`}
                    >
                      Devoirs à venir
                      <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${alertMenu === "homework" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200" : "bg-white/90 text-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}>
                        {homeworkNotifications.filter((n) => !n.read).length}
                      </span>
                    </button>
                    <button
                      onClick={() => setAlertMenu("absences")}
                      className={`rounded-xl px-3 py-2 text-[10px] font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 ${
                        alertMenu === "absences"
                          ? "border border-emerald-200 bg-emerald-50/90 text-slate-900 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100"
                          : "bg-transparent text-slate-700 hover:bg-emerald-50/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      }`}
                    >
                      Absences
                      <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${alertMenu === "absences" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200" : "bg-white/90 text-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}>
                        {absenceNotifications.filter((n) => !n.read).length}
                      </span>
                    </button>
                    <button
                      onClick={() => setAlertMenu("info")}
                      className={`rounded-xl px-3 py-2 text-[10px] font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 ${
                        alertMenu === "info"
                          ? "border border-sky-200 bg-sky-50/90 text-slate-900 shadow-sm dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100"
                          : "bg-transparent text-slate-700 hover:bg-sky-50/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      }`}
                    >
                      Informations
                      <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${alertMenu === "info" ? "bg-sky-100 text-sky-800 dark:bg-sky-900/70 dark:text-sky-200" : "bg-white/90 text-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}>
                        {infoNotifications.filter((n) => !n.read).length}
                      </span>
                    </button>
                  </div>
                </div>

                {visibleAlertNotifications.length === 0 ? (
                  <div className="rounded-3xl border border-slate-200/90 bg-slate-50/80 p-8 text-center text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                    <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600 dark:text-emerald-400" />
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
                        className={`relative overflow-hidden rounded-2xl border p-3.5 text-left shadow-[0_4px_14px_rgba(15,23,42,0.05)] transition-all duration-200 ${
                          notif.read
                            ? "border-slate-200 bg-slate-50/90 text-slate-700 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300"
                            : "border-indigo-200 bg-indigo-50/80 text-slate-800 shadow-[0_10px_24px_rgba(79,70,229,0.10)] dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-slate-200"
                        }`}
                      >
                        <div className={`absolute left-0 top-0 h-full w-1.5 ${alertMenu === "notes" ? "bg-indigo-400" : alertMenu === "homework" ? "bg-amber-400" : alertMenu === "absences" ? "bg-emerald-400" : "bg-sky-400"}`} />
                        {!notif.read && (
                          <span className="absolute right-3.5 top-3.5 h-2.5 w-2.5 rounded-full bg-indigo-600 animate-pulse dark:bg-indigo-400" />
                        )}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${notif.read ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" : alertMenu === "notes" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/70 dark:text-indigo-300" : alertMenu === "homework" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/70 dark:text-amber-300" : alertMenu === "absences" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/70 dark:text-emerald-300" : "bg-sky-100 text-sky-700 dark:bg-sky-900/70 dark:text-sky-300"}`}>
                                <AlertTriangle className="h-3.5 w-3.5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                  {new Date(notif.createdAt).toLocaleDateString("fr-FR")} à {new Date(notif.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                                <h4 className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">
                                  {notif.title}
                                </h4>
                              </div>
                            </div>
                            <p className="mt-2 text-[11px] font-medium leading-5 text-slate-700 dark:text-slate-300">
                              {notif.message}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${notif.read ? "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" : alertMenu === "notes" ? "border-indigo-200 bg-indigo-100 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-900/70 dark:text-indigo-200" : alertMenu === "homework" ? "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/70 dark:text-amber-200" : alertMenu === "absences" ? "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200" : "border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-800 dark:bg-sky-900/70 dark:text-sky-200"}`}>
                            {notif.read ? "Consultée" : "Nouvelle"}
                          </span>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${alertMenu === "notes" ? "border-indigo-200 bg-indigo-100 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-900/70 dark:text-indigo-200" : alertMenu === "homework" ? "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/70 dark:text-amber-200" : alertMenu === "absences" ? "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200" : "border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-800 dark:bg-sky-900/70 dark:text-sky-200"}`}>
                            {alertMenu === "notes" ? "Notes" : alertMenu === "homework" ? "Devoirs" : alertMenu === "absences" ? "Absences" : "Info"}
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
                <div className="theme-panel rounded-2xl border theme-border p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Notes</h3>
                      <p className="text-[11px] text-slate-700 dark:text-slate-300 mt-1">Dernières notes publiées pour l'enfant sélectionné.</p>
                    </div>
                    <Award className="h-5 w-5 text-indigo-500 dark:text-indigo-400 shrink-0" />
                  </div>

                  {currentChild ? (
                    grades.length === 0 ? (
                      <div className="py-8 text-center text-slate-700 dark:text-slate-300 text-xs font-medium">Aucune note disponible pour l'élève sélectionné.</div>
                    ) : (
                      <div className="space-y-3 mt-4">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div>
                            <h4 className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Historique des évaluations</h4>
                            {displayedGradesAverage && (
                              <p className="text-[9px] text-slate-700 dark:text-slate-300 mt-1">Moyenne: {displayedGradesAverage} / 20</p>
                            )}
                          </div>
                          <span className="text-[9px] font-bold text-slate-100 bg-slate-800 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                            {displayedGrades.length} note(s)
                          </span>
                        </div>

                        <div className="theme-panel border theme-border rounded-xl p-2.5 mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="flex items-center justify-between gap-2">
                            <label htmlFor="grade-subject-filter" className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider shrink-0">
                              Matiere
                            </label>
                            <select
                              id="grade-subject-filter"
                              value={gradeSubjectFilter}
                              onChange={(e) => setGradeSubjectFilter(e.target.value)}
                              className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-1.5 px-2 text-[10px] font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full max-w-[190px]"
                            >
                              <option value="all">Toutes les matieres</option>
                              {availableGradeSubjects.map((subject) => (
                                <option key={subject} value={subject}>{subject}</option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <label htmlFor="grade-period-filter" className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider shrink-0">
                              Periode
                            </label>
                            <select
                              id="grade-period-filter"
                              value={gradePeriodFilter}
                              onChange={(e) => setGradePeriodFilter(e.target.value as "all" | "7d" | "30d" | "trimester")}
                              className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-1.5 px-2 text-[10px] font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full max-w-[190px]"
                            >
                              <option value="all">Toute periode</option>
                              <option value="7d">7 derniers jours</option>
                              <option value="30d">30 derniers jours</option>
                              <option value="trimester">Trimestre</option>
                            </select>
                          </div>
                        </div>

                        {displayedGrades.length === 0 ? (
                          <div className="text-center py-6 text-slate-700 dark:text-slate-300 text-xs font-medium">Aucune note pour ce filtre matiere/periode.</div>
                        ) : (
                          <div className="space-y-3">
                            {displayedGrades.map((g) => {
                              const tone = getGradeToneClasses(g.grade, g.maxScore);

                              return (
                                <div key={g.id} className={`rounded-2xl border p-3 ${tone.card}`}>
                                  <div className="flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                      <p className={`text-[10px] font-bold uppercase tracking-wider ${tone.title}`}>{g.subject}</p>
                                      <h4 className="text-sm font-black text-slate-900 dark:text-white truncate">{g.examName}</h4>
                                      <p className="text-[10px] text-slate-700 dark:text-slate-300 mt-0.5">Le {new Date(g.date).toLocaleDateString("fr-FR")}</p>
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
                    <div className="py-8 text-center text-slate-700 dark:text-slate-300 text-xs font-medium">Sélectionnez un enfant pour afficher ses notes.</div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

      </div>

      {/* Persistent Bottom Bar Navigation - Parent Portal */}
      <div className="fixed bottom-0 left-0 right-0 h-16 theme-card theme-border flex items-center justify-around px-2 py-1 shadow-md z-50">
        <button
          onClick={() => handleNavigateTab("children")}
          className={`flex-1 flex flex-col items-center gap-1 py-1 text-[9px] font-bold ${
            activeTab === "children" ? "text-indigo-600 dark:text-indigo-400" : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <School className="h-4.5 w-4.5" />
          <span>Accueil</span>
        </button>

        <button
          onClick={() => handleNavigateTab("notes")}
          className={`flex-1 flex flex-col items-center gap-1 py-1 text-[9px] font-bold ${
            activeTab === "notes" ? "text-indigo-600 dark:text-indigo-400" : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <Award className="h-4.5 w-4.5" />
          <span>Notes</span>
        </button>

        <button
          onClick={() => handleNavigateTab("notifications")}
          className={`flex-1 flex flex-col items-center gap-1 py-1 text-[9px] font-bold relative ${
            activeTab === "notifications" ? "text-indigo-600 dark:text-indigo-400" : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
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
            activeTab === "alerts" ? "text-rose-600 dark:text-rose-400" : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
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
