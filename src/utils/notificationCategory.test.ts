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

test("homework publication markers override the legacy grade type and exclude Notes", () => {
  const notification = {
    type: "grade" as const,
    target: "homework",
    category: "evaluation",
    metadata: { target: "homework" },
    title: "Nouveau devoir publié : Devoir S1.1",
    message: "Un nouveau devoir en mathématiques a été programmé pour la classe.",
  };

  const notifications = [notification];
  const homework = notifications.filter((item) => classifyParentNotification(item) === "homework");
  const notes = notifications.filter((item) => classifyParentNotification(item) === "notes");

  assert.deepEqual(homework, [notification]);
  assert.deepEqual(notes, []);
});

test("persisted homework publication text is classified as homework without push metadata", () => {
  assert.equal(classifyParentNotification({
    type: "grade",
    title: "Nouveau devoir publié : Devoir S1.1",
    message: "Un nouveau devoir en mathématiques a été programmé pour la classe.",
  }), "homework");
});

test("a real grade notification remains in Notes even when it mentions a devoir", () => {
  const notification = {
    type: "grade" as const,
    title: "Nouvelle note pour Awa",
    message: "La note est disponible pour le devoir Devoir S1.1.",
  };

  assert.equal(classifyParentNotification(notification), "notes");
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