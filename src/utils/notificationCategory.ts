import type { AppNotification, AppNotificationType } from "../types";

export type ParentNotificationCategory = "notes" | "homework" | "absences" | "info";

type ParentNotificationClassificationInput = Pick<AppNotification, "type" | "title" | "message"> & {
  category?: string;
  target?: string;
  metadata?: { target?: string | null } | null;
};

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

export function classifyParentNotification(notif: ParentNotificationClassificationInput): ParentNotificationCategory {
  const target = normalizeNotificationText(notif.target ?? notif.metadata?.target);
  const category = normalizeNotificationText(notif.category);
  if (["homework", "assignment", "devoir"].includes(target)
    || ["evaluation", "evaluation created", "homework", "assignment", "devoir"].includes(category)) {
    return "homework";
  }

  const normalizedTitle = normalizeNotificationText(notif.title);
  const payload = `${normalizedTitle} ${normalizeNotificationText(notif.message)}`;
  const isPublishedHomework =
    /^(nouveau devoir publie|nouveau devoir a venir)\b/.test(normalizedTitle)
    || /\bun nouveau devoir\b.*\b(a ete programme|programme|publie)\b/.test(payload);
  if (isPublishedHomework) return "homework";

  if (notif.type) {
    return explicitTypeCategories[notif.type] ?? "info";
  }

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