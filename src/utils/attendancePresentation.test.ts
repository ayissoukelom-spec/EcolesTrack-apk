import assert from "node:assert/strict";
import test from "node:test";
import { getAttendanceReasonLabel } from "./attendanceJustification.ts";
import {
  getAttendanceAlertPresentation,
  getAttendanceEventPresentation,
} from "./attendancePresentation.ts";

test("justified and unjustified absences and late arrivals retain distinct event markers", () => {
  const cases = [
    {
      eventType: "absence" as const,
      status: "APPROVED" as const,
      reason: "Absence justifiée",
      expectedReason: "Absence justifiée",
      label: "Absence",
      accent: "sky",
    },
    {
      eventType: "late" as const,
      status: "APPROVED" as const,
      reason: "Retard enregistré",
      expectedReason: "Retard justifié",
      label: "Retard",
      accent: "orange",
    },
    {
      eventType: "absence" as const,
      status: null,
      reason: "Absence non justifiée",
      expectedReason: "Absence non justifiée",
      label: "Absence",
      accent: "sky",
    },
    {
      eventType: "late" as const,
      status: null,
      reason: "Retard enregistré",
      expectedReason: "Retard enregistré",
      label: "Retard",
      accent: "orange",
    },
  ];

  for (const { eventType, status, reason, expectedReason, label, accent } of cases) {
    const presentation = getAttendanceEventPresentation(eventType);
    assert.equal(presentation.label, label);
    assert.match(presentation.cardAccentClassName, new RegExp(accent));
    assert.equal(getAttendanceReasonLabel(reason, eventType, status), expectedReason);
  }

  assert.notEqual(
    getAttendanceEventPresentation("absence").cardAccentClassName,
    getAttendanceEventPresentation("late").cardAccentClassName,
  );
});

test("alerts identify absence and late-arrival events from their titles or messages", () => {
  const absenceAlert = getAttendanceAlertPresentation("Absence justifiée", "La justification a été acceptée.");
  const lateAlert = getAttendanceAlertPresentation("Justification acceptée", "Votre retard a été justifié.");

  assert.equal(absenceAlert?.label, "Absence");
  assert.equal(absenceAlert?.stripClassName, getAttendanceEventPresentation("absence").stripClassName);
  assert.equal(lateAlert?.label, "Retard");
  assert.equal(lateAlert?.stripClassName, getAttendanceEventPresentation("late").stripClassName);
});

test("ambiguous alerts do not guess an event type from justification wording", () => {
  assert.equal(getAttendanceAlertPresentation("Justification acceptée", "Votre demande a été acceptée."), null);
});
