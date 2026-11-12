import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AttendanceEventMarker } from "./AttendanceEventMarker.tsx";

const parentPortalSource = readFileSync(new URL("./ParentPortal.tsx", import.meta.url), "utf8");

test("the grand Parent Absences menu renders a visible blue absence marker", () => {
  const markup = renderToStaticMarkup(createElement(AttendanceEventMarker, { eventType: "absence" }));

  assert.match(markup, /border-sky-200/);
  assert.match(markup, /bg-sky-500/);
  assert.match(markup, />Absence<\/span>/);
  assert.match(parentPortalSource, /attendanceRecords\.map[\s\S]*?<AttendanceEventMarker eventType=\{abs\.eventType\}/);
});

test("the grand Parent Absences menu renders a visible orange late marker", () => {
  const markup = renderToStaticMarkup(createElement(AttendanceEventMarker, { eventType: "late" }));

  assert.match(markup, /border-orange-200/);
  assert.match(markup, /bg-orange-500/);
  assert.match(markup, />Retard<\/span>/);
});

test("the approved justification status remains green in the Parent Absences menu", () => {
  assert.match(parentPortalSource, /isApproved[\s\S]*?text-emerald-700[\s\S]*?Justifiée/);
});
