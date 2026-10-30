import assert from "node:assert/strict";
import test from "node:test";
import {
  clearPersistedParentSession,
  DISABLED_PARENT_MESSAGE,
  getDisabledParentMessage,
} from "./parentSession.js";

test("clears cached parent identity and both mobile authentication tokens", () => {
  const values = new Map<string, string>([
    ["ecoletrack_token", "access"],
    ["ecoletrack_refresh_token", "refresh"],
    ["ecoletrack_parent", "{\"id\":\"42\"}"],
    ["fcm_token", "push"],
    ["ecoletrack_device_id", "device"],
  ]);
  clearPersistedParentSession({
    removeItem: (key) => { values.delete(key); },
  });

  assert.equal(values.has("ecoletrack_token"), false);
  assert.equal(values.has("ecoletrack_refresh_token"), false);
  assert.equal(values.has("ecoletrack_parent"), false);
  assert.equal(values.get("fcm_token"), "push");
  assert.equal(values.get("ecoletrack_device_id"), "device");
});

test("recognizes the disabled-parent authorization response", async () => {
  const response = new Response(JSON.stringify({
    error: DISABLED_PARENT_MESSAGE,
    code: "ACCOUNT_DISABLED",
  }), { status: 401 });

  assert.equal(await getDisabledParentMessage(response), DISABLED_PARENT_MESSAGE);
});

test("does not mistake other unauthorized responses for a disabled account", async () => {
  const response = new Response(JSON.stringify({
    error: "Session invalide.",
    code: "INVALID_SESSION",
  }), { status: 401 });

  assert.equal(await getDisabledParentMessage(response), null);
});
