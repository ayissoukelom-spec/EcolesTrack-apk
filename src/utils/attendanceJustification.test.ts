import assert from "node:assert/strict";
import test from "node:test";
import { getAttendanceReasonLabel } from "./attendanceJustification.ts";

test("approved late-arrival fallback agrees with its justification status", () => {
  assert.equal(getAttendanceReasonLabel("Retard enregistré", "late", "APPROVED"), "Retard justifié");
});

test("unapproved late-arrival fallback remains recorded, not justified", () => {
  assert.equal(getAttendanceReasonLabel("Retard enregistré", "late", null), "Retard enregistré");
  assert.equal(getAttendanceReasonLabel("Retard enregistré", "late", "PENDING"), "Retard enregistré");
});

test("specific arrival reasons and absence reasons are preserved", () => {
  assert.equal(getAttendanceReasonLabel("Bus en retard", "late", "APPROVED"), "Bus en retard");
  assert.equal(getAttendanceReasonLabel("Retard enregistré", "absence", "APPROVED"), "Retard enregistré");
});
