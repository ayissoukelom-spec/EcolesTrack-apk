import assert from 'node:assert/strict';
import test from 'node:test';
import { getConfirmedPushAssociationKey, getPushAssociationKey, PushAssociationQueue, shouldRegisterPushAssociation, withPushAssociationTimeout } from './pushAssociation.ts';

test('deduplicates a registration by parent, device, and FCM token', () => {
  const parent604 = getPushAssociationKey('604', 'device-a', 'token-t');
  const parent605 = getPushAssociationKey('605', 'device-a', 'token-t');
  const secondDevice = getPushAssociationKey('604', 'device-b', 'token-t');
  const rotatedToken = getPushAssociationKey('604', 'device-a', 'token-t2');

  assert.ok(parent604);
  assert.equal(shouldRegisterPushAssociation(parent604, null, null), true);
  assert.equal(shouldRegisterPushAssociation(parent604, parent604, null), false);
  assert.equal(shouldRegisterPushAssociation(parent604, null, parent604), false);
  assert.notEqual(parent604, parent605);
  assert.notEqual(parent604, secondDevice);
  assert.notEqual(parent604, rotatedToken);
  assert.equal(shouldRegisterPushAssociation(parent605, parent604, null), true);
  assert.equal(shouldRegisterPushAssociation(secondDevice, parent604, null), true);
  assert.equal(shouldRegisterPushAssociation(rotatedToken, parent604, null), true);
  assert.equal(getPushAssociationKey('604', 'device-a', null), null);
  assert.equal(shouldRegisterPushAssociation(null, null, null), false);
});

test('confirms only successful registration for the currently active association and session', () => {
  const associationKey = getPushAssociationKey('604', 'device-a', 'token-t');
  const otherAssociationKey = getPushAssociationKey('605', 'device-a', 'token-t');

  assert.ok(associationKey);
  assert.equal(getConfirmedPushAssociationKey(true, associationKey, associationKey, true), associationKey);
  assert.equal(getConfirmedPushAssociationKey(false, associationKey, associationKey, true), null);
  assert.equal(getConfirmedPushAssociationKey(true, associationKey, otherAssociationKey, true), null);
  assert.equal(getConfirmedPushAssociationKey(true, associationKey, associationKey, false), null);

  const unconfirmedKey = getConfirmedPushAssociationKey(false, associationKey, associationKey, true);
  assert.equal(shouldRegisterPushAssociation(associationKey, unconfirmedKey, null), true);
});

test('serializes an in-flight registration, logout deletion, and next login registration', async () => {
  const queue = new PushAssociationQueue();
  const events: string[] = [];
  let releaseRegistration!: () => void;
  const registrationGate = new Promise<void>((resolve) => {
    releaseRegistration = resolve;
  });

  const oldRegistration = queue.enqueue(async () => {
    events.push('old-register-start');
    await registrationGate;
    events.push('old-register-finished');
  });
  const logout = queue.enqueue(async () => {
    events.push('logout-delete');
  });
  const nextLoginRegistration = queue.enqueue(async () => {
    events.push('next-register');
  });

  await Promise.resolve();
  assert.deepEqual(events, ['old-register-start']);

  releaseRegistration();
  await Promise.all([oldRegistration, logout, nextLoginRegistration]);

  assert.deepEqual(events, [
    'old-register-start',
    'old-register-finished',
    'logout-delete',
    'next-register',
  ]);
});

test('continues processing queued association operations after an operation rejects', async () => {
  const queue = new PushAssociationQueue();
  const events: string[] = [];

  const failedOperation = queue.enqueue(async () => {
    events.push('failed-operation');
    throw new Error('simulated request failure');
  });
  const followingOperation = queue.enqueue(async () => {
    events.push('following-operation');
  });

  await assert.rejects(failedOperation, /simulated request failure/);
  await followingOperation;
  assert.deepEqual(events, ['failed-operation', 'following-operation']);
});

test('aborts and rejects an operation that exceeds its timeout', async () => {
  let receivedSignal: AbortSignal | undefined;

  await assert.rejects(
    withPushAssociationTimeout((signal) => {
      receivedSignal = signal;
      return new Promise<Response>(() => undefined);
    }, 10),
    /timed out after 10ms/,
  );

  assert.equal(receivedSignal?.aborted, true);
});

test('releases the queue after a timed-out registration so logout and next login can proceed', async () => {
  const queue = new PushAssociationQueue();
  const events: string[] = [];
  const oldRegistration = queue.enqueue(() => withPushAssociationTimeout(async () => {
    events.push('registration-started');
    return new Promise<void>(() => undefined);
  }, 10));
  const logout = queue.enqueue(async () => {
    events.push('logout');
  });
  const nextLoginRegistration = queue.enqueue(async () => {
    events.push('next-login-registration');
  });

  await assert.rejects(oldRegistration, /timed out/);
  await Promise.all([logout, nextLoginRegistration]);
  assert.deepEqual(events, ['registration-started', 'logout', 'next-login-registration']);
});

test('allows the same association key to be registered again after an uncertain logout', () => {
  const associationKey = getPushAssociationKey('604', 'device-a', 'token-t');
  assert.ok(associationKey);

  const lastRegisteredKey: string | null = null;
  assert.equal(shouldRegisterPushAssociation(associationKey, lastRegisteredKey, null), true);
});