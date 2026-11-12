import type { Absence } from "../types";

export function getAttendanceJustificationCopy(eventType: Absence["eventType"]) {
  if (eventType === "late") {
    return {
      buttonLabel: "Justifier ce retard",
      dialogTitle: "Justification du retard",
      missingReason: "Veuillez saisir un motif pour justifier ce retard.",
      reasonPlaceholder: "Décrivez le motif de justification du retard...",
      fileLabel: "Pièce justificative du retard (facultative)",
      submitLabel: "Envoyer la justification du retard",
      requestError: "Impossible de justifier ce retard pour le moment.",
      submitted: "La justification du retard a été envoyée.",
      submittedRefreshPending: "La justification du retard a été envoyée; le statut sera actualisé au prochain chargement.",
    };
  }

  return {
    buttonLabel: "Justifier cette absence",
    dialogTitle: "Justifier l'absence",
    missingReason: "Veuillez saisir un motif de justification.",
    reasonPlaceholder: "Décrivez le motif de justification...",
    fileLabel: "Pièce justificative (facultative)",
    submitLabel: "Envoyer la justification",
    requestError: "Impossible de justifier l'absence pour le moment.",
    submitted: "La justification de l'absence a été envoyée.",
    submittedRefreshPending: "La justification de l'absence a été envoyée; le statut sera actualisé au prochain chargement.",
  };
}

export function getAttendanceJustificationButtonColorClasses(eventType: Absence["eventType"]) {
  return eventType === "late"
    ? "bg-[#C65A11] hover:bg-[#A64A0D]"
    : "bg-indigo-600 hover:bg-indigo-700";
}

export function getAttendanceJustificationRequest(
  eventType: Absence["eventType"],
  id: string,
  hasAttachments: boolean,
) {
  const isLateArrival = eventType === "late";
  const useMultipart = isLateArrival || hasAttachments;
  const encodedId = encodeURIComponent(id);

  return {
    url: isLateArrival
      ? `/api/mobile/parent/late-arrivals/${encodedId}/justification`
      : `/api/absences/${encodedId}${hasAttachments ? "/justifications" : "/justify"}`,
    method: useMultipart ? "POST" : "PUT",
    useMultipart,
  } as const;
}
