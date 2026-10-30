import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authenticateMobileParentLoginAndRecord,
  authenticateMobileParentLogin,
  normalizeParentLoginPhone,
  selectUniqueParentPhoneMatch,
} from './parentLogin.js';

const parent = { id: '42', role: 'parent' };

const createStore = (options: {
  emailUser?: typeof parent | null;
  phoneUser?: typeof parent | null;
  passwordValid?: boolean;
} = {}) => {
  const calls = { email: [] as string[], phone: [] as string[][], verify: [] as Array<[string, string]> };
  return {
    calls,
    store: {
      async findParentByEmail(email: string) {
        calls.email.push(email);
        return options.emailUser ?? null;
      },
      async findParentByPhone(candidates: string[]) {
        calls.phone.push(candidates);
        return options.phoneUser ?? null;
      },
      async verifyParentPasswordByUserId(userId: string, password: string) {
        calls.verify.push([userId, password]);
        return options.passwordValid ?? true;
      },
    },
  };
};

test('normalizes phone separators and the local/international +228 forms consistently', () => {
  assert.deepEqual(normalizeParentLoginPhone('78 23 45 67', '+228'), ['22878234567']);
  assert.deepEqual(normalizeParentLoginPhone('78-23-45-67', '+229'), ['22978234567']);
  assert.deepEqual(normalizeParentLoginPhone('+228 (78)-23.45 67', '+229'), ['22878234567']);
  assert.deepEqual(normalizeParentLoginPhone('00229 78.23.45.67'), ['22978234567']);
  assert.deepEqual(normalizeParentLoginPhone('228-78-23-45-67', '+228'), ['22822878234567']);
  assert.deepEqual(normalizeParentLoginPhone('78 23 45 67'), []);
  assert.notDeepEqual(normalizeParentLoginPhone('78 23 45 67', '+228'), normalizeParentLoginPhone('78 23 45 67', '+229'));
});

test('authenticates a parent by email using the existing password verifier', async () => {
  const { store, calls } = createStore({ emailUser: parent });
  const result = await authenticateMobileParentLogin(' PARENT@example.com ', 'correct', undefined, store);

  assert.equal(result, parent);
  assert.deepEqual(calls.email, ['parent@example.com']);
  assert.deepEqual(calls.verify, [['42', 'correct']]);
  assert.deepEqual(calls.phone, []);
});

test('rejects a disabled parent by email before verifying the password', async () => {
  const disabledParent = { ...parent, isDeleted: true };
  const { store, calls } = createStore({ emailUser: disabledParent });

  assert.equal(await authenticateMobileParentLogin('parent@example.com', 'correct', undefined, store), null);
  assert.deepEqual(calls.verify, []);
});

test('authenticates a parent by normalized phone', async () => {
  const { store, calls } = createStore({ phoneUser: parent });
  const result = await authenticateMobileParentLogin('78 23 45 67', 'correct', '+228', store);

  assert.equal(result, parent);
  assert.deepEqual(calls.phone, [['22878234567']]);
  assert.deepEqual(calls.verify, [['42', 'correct']]);
});

test('rejects a disabled parent by phone before verifying the password', async () => {
  const disabledParent = { ...parent, isDeleted: true };
  const { store, calls } = createStore({ phoneUser: disabledParent });

  assert.equal(await authenticateMobileParentLogin('78 23 45 67', 'correct', '+228', store), null);
  assert.deepEqual(calls.verify, []);
});

test('the same local number produces distinct +228 and +229 account keys', async () => {
  const togo = createStore({ phoneUser: parent });
  const benin = createStore({ phoneUser: parent });

  await authenticateMobileParentLogin('78 23 45 67', 'correct', '+228', togo.store);
  await authenticateMobileParentLogin('78 23 45 67', 'correct', '+229', benin.store);

  assert.deepEqual(togo.calls.phone, [['22878234567']]);
  assert.deepEqual(benin.calls.phone, [['22978234567']]);
});

test('rejects unknown email/phone and a wrong password without exposing account existence', async () => {
  const missingEmail = createStore();
  const missingPhone = createStore();
  const badPassword = createStore({ emailUser: parent, passwordValid: false });
  const badPhonePassword = createStore({ phoneUser: parent, passwordValid: false });

  assert.equal(await authenticateMobileParentLogin('missing@example.com', 'wrong', undefined, missingEmail.store), null);
  assert.equal(await authenticateMobileParentLogin('78 23 45 67', 'wrong', '+228', missingPhone.store), null);
  assert.equal(await authenticateMobileParentLogin('parent@example.com', 'wrong', undefined, badPassword.store), null);
  assert.equal(await authenticateMobileParentLogin('78 23 45 67', 'wrong', '+228', badPhonePassword.store), null);
});

test('refuses multiple parent rows instead of selecting an arbitrary phone match', async () => {
  const matches = [
    { user_id: 42, role: 'parent' },
    { user_id: 43, role: 'parent' },
  ];
  assert.equal(selectUniqueParentPhoneMatch(matches), null);
  assert.equal(selectUniqueParentPhoneMatch([matches[0], matches[0]]), matches[0]);

  const { store, calls } = createStore();
  assert.equal(await authenticateMobileParentLogin('78 23 45 67', 'correct', '+228', store), null);
  assert.deepEqual(calls.verify, []);
});

test('keeps email authentication available to existing non-parent roles but scopes phone to parents', async () => {
  const teacher = { id: '9', role: 'teacher' };
  const emailStore = createStore({ emailUser: teacher as typeof parent });
  const phoneStore = createStore({ phoneUser: teacher as typeof parent });

  assert.equal(await authenticateMobileParentLogin('teacher@example.com', 'correct', undefined, emailStore.store), teacher);
  assert.equal(await authenticateMobileParentLogin('78 23 45 67', 'correct', '+228', phoneStore.store), null);
  assert.deepEqual(phoneStore.calls.verify, []);
});

test('records the authenticated parent id after successful authentication', async () => {
  const { store } = createStore({ emailUser: parent });
  const recordedUserIds: string[] = [];

  const result = await authenticateMobileParentLoginAndRecord(
    'parent@example.com',
    'correct',
    undefined,
    store,
    async (userId) => { recordedUserIds.push(userId); return 1; },
  );

  assert.equal(result, parent);
  assert.deepEqual(recordedUserIds, ['42']);
});

test('does not record a failed parent login', async () => {
  const { store } = createStore({ emailUser: parent, passwordValid: false });
  const recordedUserIds: string[] = [];

  const result = await authenticateMobileParentLoginAndRecord(
    'parent@example.com',
    'wrong',
    undefined,
    store,
    async (userId) => { recordedUserIds.push(userId); return 1; },
  );

  assert.equal(result, null);
  assert.deepEqual(recordedUserIds, []);
});

test('does not record an authenticated user with a non-parent role', async () => {
  const teacher = { id: '9', role: 'teacher' };
  const { store } = createStore({ emailUser: teacher as typeof parent });
  const recordedUserIds: string[] = [];

  const result = await authenticateMobileParentLoginAndRecord(
    'teacher@example.com',
    'correct',
    undefined,
    store,
    async (userId) => { recordedUserIds.push(userId); return 1; },
  );

  assert.equal(result, teacher);
  assert.deepEqual(recordedUserIds, []);
});

test('propagates a failed last-login write instead of reporting authenticated success', async () => {
  const { store } = createStore({ emailUser: parent });

  await assert.rejects(
    authenticateMobileParentLoginAndRecord(
      'parent@example.com',
      'correct',
      undefined,
      store,
      async () => { throw new Error('write failed'); },
    ),
    /Failed to record the authenticated parent login/,
  );
});

test('propagates a failed last-login write when no database row is updated', async () => {
  const { store } = createStore({ emailUser: parent });

  await assert.rejects(
    authenticateMobileParentLoginAndRecord(
      'parent@example.com',
      'correct',
      undefined,
      store,
      async () => 0,
    ),
    /Failed to record the authenticated parent login/,
  );
});