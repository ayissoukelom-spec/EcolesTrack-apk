export type NotificationNavigationRoute = {
  tab: string;
  alertMenu: "notes" | "homework" | "absences" | "info" | null;
};

export function getNotificationNavigationRoute(target: string | null | undefined): NotificationNavigationRoute | null {
  const normalizedTarget = target?.trim().toLowerCase();
  if (!normalizedTarget) return null;

  if (normalizedTarget === "absence") {
    return { tab: "notifications", alertMenu: null };
  }
  if (["note", "notes", "grade", "grades"].includes(normalizedTarget)) {
    return { tab: "notes", alertMenu: null };
  }
  if (normalizedTarget === "assignment" || normalizedTarget === "homework") {
    return { tab: "alerts", alertMenu: "homework" };
  }
  if (normalizedTarget === "announcement" || normalizedTarget === "payment") {
    return { tab: "alerts", alertMenu: "info" };
  }
  return null;
}
