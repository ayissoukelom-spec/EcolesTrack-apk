import assert from "node:assert/strict";
import test from "node:test";
import {
  parseDataInvalidation,
  shouldRefreshGradesForInvalidation,
  shouldRefreshParentDataForInvalidation,
} from "./dataInvalidation";

test("parses only invalidation metadata and targets the selected child", () => {
  const event = parseDataInvalidation({
    domain: "grades",
    eventId: "grade-12-event-3",
    entityIds: ["child-1"],
    revision: "3",
    score: 19,
  });

  assert.deepEqual(event, {
    domain: "grades",
    eventId: "grade-12-event-3",
    entityIds: ["child-1"],
    revision: "3",
  });
  assert.equal(shouldRefreshGradesForInvalidation(event!, "child-1"), true);
  assert.equal(shouldRefreshGradesForInvalidation(event!, "child-2"), false);
  assert.equal(shouldRefreshGradesForInvalidation({
    domain: "grades",
    eventId: "evaluation-delete-1",
  }, "child-2"), true);
  assert.equal(parseDataInvalidation({ domain: "grades", eventId: "" }), null);
  assert.equal(shouldRefreshGradesForInvalidation(event!, undefined), false);
});

test("targets attendance invalidations and rejects unrelated domains", () => {
  const event = parseDataInvalidation({
    domain: "attendance",
    eventId: "late-arrival-update-1",
    entityIds: ["child-1"],
  });

  assert.equal(shouldRefreshParentDataForInvalidation(event!, "attendance", "child-1"), true);
  assert.equal(shouldRefreshParentDataForInvalidation(event!, "attendance", "child-2"), false);
  assert.equal(shouldRefreshParentDataForInvalidation(event!, "grades", "child-1"), false);
  assert.equal(parseDataInvalidation({ domain: "unregistered-domain", eventId: "event-1" }), null);
});
