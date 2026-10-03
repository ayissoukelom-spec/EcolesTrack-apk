import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
  assert.deepEqual(normalizeParentLoginPhone('90 12 34 56'), ['90123456', '22890123456']);
  assert.deepEqual(normalizeParentLoginPhone('+228 (90)-12.34 56'), ['22890123456', '90123456']);
  assert.deepEqual(normalizeParentLoginPhone('228-90-12-34-56'), ['22890123456', '90123456']);
  assert.deepEqual(normalizeParentLoginPhone('+33 6 12 34 56 78'), ['33612345678']);
});

test('authenticates a parent by email using the existing password verifier', async () => {
  const { store, calls } = createStore({ emailUser: parent });
  const result = await authenticateMobileParentLogin(' PARENT@example.com ', 'correct', store);

  assert.equal(result, parent);
  assert.deepEqual(calls.email, ['parent@example.com']);
  assert.deepEqual(calls.verify, [['42', 'correct']]);
  assert.deepEqual(calls.phone, []);
});

test('authenticates a parent by normalized phone', async () => {
  const { store, calls } = createStore({ phoneUser: parent });
  const result = await authenticateMobileParentLogin('+228 90-12-34-56', 'correct', store);

  assert.equal(result, parent);
  assert.deepEqual(calls.phone, [['22890123456', '90123456']]);
  assert.deepEqual(calls.verify, [['42', 'correct']]);
});

test('rejects unknown email/phone and a wrong password without exposing account existence', async () => {
  const missingEmail = createStore();
  const missingPhone = createStore();
  const badPassword = createStore({ emailUser: parent, passwordValid: false });
  const badPhonePassword = createStore({ phoneUser: parent, passwordValid: false });

  assert.equal(await authenticateMobileParentLogin('missing@example.com', 'wrong', missingEmail.store), null);
  assert.equal(await authenticateMobileParentLogin('90123456', 'wrong', missingPhone.store), null);
  assert.equal(await authenticateMobileParentLogin('parent@example.com', 'wrong', badPassword.store), null);
  assert.equal(await authenticateMobileParentLogin('90123456', 'wrong', badPhonePassword.store), null);
});

test('refuses multiple parent rows instead of selecting an arbitrary phone match', async () => {
  const matches = [
    { user_id: 42, role: 'parent' },
    { user_id: 43, role: 'parent' },
  ];
  assert.equal(selectUniqueParentPhoneMatch(matches), null);
  assert.equal(selectUniqueParentPhoneMatch([matches[0], matches[0]]), matches[0]);

  const { store, calls } = createStore();
  assert.equal(await authenticateMobileParentLogin('90123456', 'correct', store), null);
  assert.deepEqual(calls.verify, []);
});

test('keeps email authentication available to existing non-parent roles but scopes phone to parents', async () => {
  const teacher = { id: '9', role: 'teacher' };
  const emailStore = createStore({ emailUser: teacher as typeof parent });
  const phoneStore = createStore({ phoneUser: teacher as typeof parent });

  assert.equal(await authenticateMobileParentLogin('teacher@example.com', 'correct', emailStore.store), teacher);
  assert.equal(await authenticateMobileParentLogin('90123456', 'correct', phoneStore.store), null);
  assert.deepEqual(phoneStore.calls.verify, []);
});