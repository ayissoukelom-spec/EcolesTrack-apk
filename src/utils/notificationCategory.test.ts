import assert from "node:assert/strict";
import test from "node:test";
import { classifyParentNotification } from "./notificationCategory.js";

test("explicit info type stays in Info regardless of note and homework keywords", () => {
  for (const message of [
    "Bonjour",
    "Voici le bulletin de la semaine",
    "Bulletin de rentrée",
    "Nouvelle note importante concernant la classe",
    "Devoir et bulletin à consulter",
  ]) {
    assert.equal(classifyParentNotification({ type: "info", title: "Information", message }), "info", message);
  }

  assert.equal(
    classifyParentNotification({ type: "info", title: "Bulletin de rentrée", message: "Information importante" }),
    "info",
  );
});

test("explicit grade type stays in Notes regardless of message text", () => {
  for (const message of ["Nouvelle note en mathématiques", "Bulletin des résultats", "Bonjour"]) {
    assert.equal(classifyParentNotification({ type: "grade", title: "Information", message }), "notes", message);
  }
});

test("explicit absence and homework types take precedence over message keywords", () => {
  assert.equal(classifyParentNotification({ type: "absence", title: "Bulletin", message: "Nouvelle note" }), "absences");
  assert.equal(classifyParentNotification({ type: "homework", title: "Info", message: "Bulletin" }), "homework");
});

test("legacy notifications without a type retain keyword classification", () => {
  assert.equal(classifyParentNotification({ title: "Bulletin", message: "Résultats" }), "notes");
  assert.equal(classifyParentNotification({ title: "Devoir", message: "À rendre" }), "homework");
  assert.equal(classifyParentNotification({ title: "Absence", message: "Justification" }), "absences");
  assert.equal(classifyParentNotification({ title: "Annonce", message: "Réunion" }), "info");
});