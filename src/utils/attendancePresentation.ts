import type { Absence } from "../types";

export type AttendanceEventType = NonNullable<Absence["eventType"]>;

const eventPresentations: Record<AttendanceEventType, {
  label: string;
  cardAccentClassName: string;
  stripClassName: string;
  dotClassName: string;
  iconClassName: string;
  badgeClassName: string;
}> = {
  absence: {
    label: "Absence",
    cardAccentClassName: "border-l-sky-500",
    stripClassName: "bg-sky-500",
    dotClassName: "bg-sky-500",
    iconClassName: "bg-sky-100 text-sky-700 dark:bg-sky-900/70 dark:text-sky-300",
    badgeClassName: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
  },
  late: {
    label: "Retard",
    cardAccentClassName: "border-l-orange-500",
    stripClassName: "bg-orange-500",
    dotClassName: "bg-orange-500",
    iconClassName: "bg-orange-100 text-orange-700 dark:bg-orange-900/70 dark:text-orange-300",
    badgeClassName: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-200",
  },
};

export function getAttendanceEventPresentation(eventType: AttendanceEventType) {
  return eventPresentations[eventType];
}

function classifyAttendanceText(text: string): AttendanceEventType | null {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
  const hasAbsence = /\babsences?\b/.test(normalized);
  const hasLateArrival = /\bretards?\b/.test(normalized);

  if (hasAbsence === hasLateArrival) return null;
  return hasLateArrival ? "late" : "absence";
}

export function getAttendanceAlertPresentation(title: string, message: string) {
  const titleType = classifyAttendanceText(title);
  const eventType = titleType ?? classifyAttendanceText(message);
  if (!eventType) return null;

  return {
    eventType,
    ...getAttendanceEventPresentation(eventType),
  };
}
