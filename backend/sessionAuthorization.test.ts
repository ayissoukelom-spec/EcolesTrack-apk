import assert from "node:assert/strict";
import test from "node:test";
import { createMobileRequireAuth, getMobileSessionRejection } from "./sessionAuthorization.js";

const activeParent = {
  role: "parent",
  isDeleted: false,
  latestRevocationEventId: 0,
};

test("accepts an active parent session at the current revocation boundary", () => {
  assert.equal(getMobileSessionRejection({
    parentId: "42",
    role: "parent",
    authRevocationEventId: 0,
  }, activeParent), null);
});

test("rejects access tokens while the parent account is disabled", () => {
  assert.equal(getMobileSessionRejection({
    parentId: "42",
    role: "parent",
    authRevocationEventId: 0,
  }, { ...activeParent, isDeleted: true, latestRevocationEventId: 10 }), "account_disabled");
});

test("rejects old access and refresh tokens after reactivation", () => {
  const reactivatedParent = { ...activeParent, latestRevocationEventId: 12 };
  assert.equal(getMobileSessionRejection({
    parentId: "42",
    role: "parent",
    authRevocationEventId: 10,
  }, reactivatedParent), "session_revoked");
  assert.equal(getMobileSessionRejection({
    parentId: "42",
    role: "parent",
    authRevocationEventId: 12,
  }, reactivatedParent), null);
});

test("rejects legacy tokens without a revocation claim after an account lifecycle event", () => {
  assert.equal(getMobileSessionRejection({
    parentId: "42",
    role: "parent",
  }, { ...activeParent, latestRevocationEventId: 12 }), "session_revoked");
});

test("does not authorize tokens for another role or missing account", () => {
  assert.equal(getMobileSessionRejection({
    parentId: "42",
    role: "teacher",
  }, { ...activeParent, role: "teacher" }), "invalid_session");
  assert.equal(getMobileSessionRejection({
    parentId: "42",
    role: "parent",
  }, null), "invalid_session");
});

test("the protected-route middleware denies a disabled parent's existing access token", async () => {
  const middleware = createMobileRequireAuth(
    () => ({ parentId: "42", role: "parent", authRevocationEventId: 0 }),
    async () => ({ ...activeParent, isDeleted: true }),
    () => assert.fail("A valid authorization lookup must not log an error"),
  );
  const response = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  const next = () => assert.fail("Disabled parent must not reach a protected handler");

  await middleware({
    headers: { authorization: "Bearer valid-token" },
  } as never, response as never, next as never);

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, {
    error: "Ce compte est désactivé. Contactez votre administrateur.",
    code: "ACCOUNT_DISABLED",
  });
});

test("the protected-route middleware allows an active parent at the current boundary", async () => {
  const middleware = createMobileRequireAuth(
    () => ({ parentId: "42", role: "parent", authRevocationEventId: 0 }),
    async () => activeParent,
    () => assert.fail("A valid authorization lookup must not log an error"),
  );
  const request: {
    headers: { authorization: string };
    parent?: { id: string; email: string; role: string };
  } = { headers: { authorization: "Bearer active-token" } };
  const response = {
    status() { assert.fail("Active parent must not receive an authentication error"); return this; },
    json() { assert.fail("Active parent must not receive an authentication error"); return this; },
  };
  let nextCalled = false;

  await middleware(request as never, response as never, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(request.parent?.id, "42");
  assert.equal(request.parent?.role, "parent");
});

test("the protected-route middleware preserves the existing role guard for non-parent sessions", async () => {
  const middleware = createMobileRequireAuth(
    () => ({ parentId: "77", role: "teacher" }),
    async () => {
      assert.fail("Non-parent sessions are rejected by the existing parent-role guard");
      return null;
    },
    () => assert.fail("Account status must not be queried for non-parent roles"),
  );
  const request: {
    headers: { authorization: string };
    parent?: { id: string; email: string; role: string };
  } = { headers: { authorization: "Bearer teacher-token" } };
  let nextCalled = false;

  await middleware(request as never, {} as never, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(request.parent?.role, "teacher");
});

test("the protected-route middleware rejects an old token after parent reactivation", async () => {
  const middleware = createMobileRequireAuth(
    () => ({ parentId: "42", role: "parent", authRevocationEventId: 10 }),
    async () => ({ ...activeParent, latestRevocationEventId: 12 }),
    () => assert.fail("A valid authorization lookup must not log an error"),
  );
  const response = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  const next = () => assert.fail("Revoked parent session must not reach a protected handler");

  await middleware({
    headers: { authorization: "Bearer old-token" },
  } as never, response as never, next as never);

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, {
    error: "Session invalide ou révoquée. Veuillez vous reconnecter.",
    code: "INVALID_SESSION",
  });
});

test("the protected-route middleware fails closed when account status cannot be checked", async () => {
  const databaseError = new Error("status query failed");
  let loggedError: unknown;
  const middleware = createMobileRequireAuth(
    () => ({ parentId: "42", role: "parent", authRevocationEventId: 0 }),
    async () => { throw databaseError; },
    (error) => { loggedError = error; },
  );
  const response = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  const next = () => assert.fail("Unverified parent must not reach a protected handler");

  await middleware({
    headers: { authorization: "Bearer valid-token" },
  } as never, response as never, next as never);

  assert.equal(response.statusCode, 503);
  assert.equal(loggedError, databaseError);
  assert.deepEqual(response.body, {
    error: "Vérification de la session indisponible. Réessayez.",
    code: "AUTH_STATUS_UNAVAILABLE",
  });
});
