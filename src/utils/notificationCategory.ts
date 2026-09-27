import type { AppNotification, AppNotificationType } from "../types";

export type ParentNotificationCategory = "notes" | "homework" | "absences" | "info";

const normalizeNotificationText = (text?: string) =>
  (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u000c-\u000f\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();

const explicitTypeCategories: Record<AppNotificationType, ParentNotificationCategory> = {
  absence: "absences",
  grade: "notes",
  info: "info",
  assignment: "homework",
  homework: "homework",
  devoir: "homework",
  general: "info",
  test: "info",
};

export function classifyParentNotification(notif: Pick<AppNotification, "type" | "title" | "message">): ParentNotificationCategory {
  if (notif.type) {
    return explicitTypeCategories[notif.type] ?? "info";
  }

  const normalizedTitle = normalizeNotificationText(notif.title);
  const payload = `${normalizeNotificationText(notif.title)} ${normalizeNotificationText(notif.message)}`;

  if (/^(nouvelle note pour|note modifiee pour|nouvelle note disponible)\b/.test(normalizedTitle)) {
    return "notes";
  }

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
}