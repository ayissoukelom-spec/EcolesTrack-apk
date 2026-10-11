import assert from "node:assert/strict";
import test from "node:test";
import { getNotificationNavigationRoute } from "./notificationNavigation.js";

test("payment notifications open the existing Information section", () => {
  assert.deepEqual(getNotificationNavigationRoute("payment"), {
    tab: "alerts",
    alertMenu: "info",
  });
});

test("announcement and other notification destinations retain their routes", () => {
  assert.deepEqual(getNotificationNavigationRoute("announcement"), {
    tab: "alerts",
    alertMenu: "info",
  });
  assert.deepEqual(getNotificationNavigationRoute("grade"), {
    tab: "notes",
    alertMenu: null,
  });
  assert.deepEqual(getNotificationNavigationRoute("absence"), {
    tab: "notifications",
    alertMenu: null,
  });
  assert.deepEqual(getNotificationNavigationRoute("homework"), {
    tab: "alerts",
    alertMenu: "homework",
  });
});

test("missing or unrecognized destinations preserve the current route", () => {
  assert.equal(getNotificationNavigationRoute(undefined), null);
  assert.equal(getNotificationNavigationRoute(""), null);
  assert.equal(getNotificationNavigationRoute("home"), null);
});
