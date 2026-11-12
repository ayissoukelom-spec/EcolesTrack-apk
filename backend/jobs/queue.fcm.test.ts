import assert from 'node:assert/strict';
import { activeQueue, deadLetterQueue, completedJobIds, QueueManager } from './queue.ts';
import { store } from '../store.ts';
import {
  InvalidFcmTokenError,
  isInvalidFcmTokenError,
  isPermanentFcmCredentialError,
} from '../services/fcm.ts';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

async function resetQueue() {
  activeQueue.length = 0;
  deadLetterQueue.length = 0;
  completedJobIds.clear();
}

async function run() {
  console.log('Running FCM invalid token audit tests...');

  // Detection tests
  assert.strictEqual(
    isInvalidFcmTokenError({ code: 'messaging/registration-token-not-registered', message: 'Test' }),
    true,
    'Should identify messaging/registration-token-not-registered as invalid'
  );

  assert.strictEqual(
    isInvalidFcmTokenError({ code: 'messaging/invalid-registration-token', message: 'Test' }),
    true,
    'Should identify messaging/invalid-registration-token as invalid'
  );

  assert.strictEqual(
    isInvalidFcmTokenError({ code: 'registration-token-not-registered', message: 'Test' }),
    true,
    'Should identify registration-token-not-registered as invalid'
  );

  assert.strictEqual(
    isInvalidFcmTokenError({ code: 'invalid-registration-token', message: 'Test' }),
    true,
    'Should identify invalid-registration-token as invalid'
  );

  assert.strictEqual(
    isInvalidFcmTokenError({ errorInfo: { code: 'messaging/registration-token-not-registered' }, message: 'Test' }),
    true,
    'Should identify invalid token from error.errorInfo.code'
  );

  assert.strictEqual(
    isInvalidFcmTokenError({ message: 'NotRegistered' }),
    true,
    'Should identify NotRegistered message as invalid'
  );

  assert.strictEqual(
    isInvalidFcmTokenError({ message: 'registration token not registered' }),
    true,
    'Should identify registration token not registered message as invalid'
  );

  assert.strictEqual(
    isInvalidFcmTokenError({ message: 'Temporary server error' }),
    false,
    'Should not identify a generic temporary error as invalid'
  );
  assert.strictEqual(
    isPermanentFcmCredentialError({ code: 'messaging/mismatched-credential' }),
    true,
    'Should identify a permanent Firebase credential mismatch'
  );
  assert.strictEqual(
    isPermanentFcmCredentialError({ errorInfo: { code: 'messaging/sender-id-mismatch' } }),
    true,
    'Should identify a permanent sender ID mismatch'
  );
  assert.strictEqual(
    isPermanentFcmCredentialError({ code: 'messaging/server-unavailable' }),
    false,
    'Should leave transient Firebase errors retryable'
  );
  assert.strictEqual(
    isPermanentFcmCredentialError(new Error('ECONNRESET')),
    false,
    'Should distinguish network errors from credential mismatches'
  );
  assert.equal(
    new InvalidFcmTokenError('synthetic-token-value', new Error('test')).message.includes('synthetic-token-value'),
    false,
    'Invalid token errors must not include the registration token in their message'
  );

  // Queue behavior tests
  const originalExecuteJobLogic = (QueueManager as any).executeJobLogic;
  const originalDeletePushToken = store.deletePushToken;

  try {
    await resetQueue();

    const deletedTokens: Array<{ parentId: string; token: string }> = [];
    store.deletePushToken = async (parentId: string, token: string) => {
      deletedTokens.push({ parentId, token });
    };

    // Case 1: messaging/registration-token-not-registered -> deletion + no retry
    let invalidJobCount = 0;
    (QueueManager as any).executeJobLogic = async (job: any) => {
      invalidJobCount += 1;
      throw new InvalidFcmTokenError(job.data.token, {
        code: 'messaging/registration-token-not-registered',
        message: 'registration token not registered',
      });
    };

    QueueManager.addJob('send-notification-push', {
      parentId: 'parent-x',
      token: 'token-invalid-1',
      title: 'Titre',
      message: 'Message',
      category: 'grade',
      metadata: {},
      channel: 'push',
    }, { maxAttempts: 3 });

    await delay(500);

    assert.strictEqual(invalidJobCount, 1, 'Invalid token job should run exactly once');
    assert.deepStrictEqual(deletedTokens, [{ parentId: 'parent-x', token: 'token-invalid-1' }]);
    assert.strictEqual(activeQueue.length, 0, 'Invalid token job should not remain in active queue');
    assert.strictEqual(deadLetterQueue.length, 0, 'Invalid token job should not go to DLQ');

    // Case 2: messaging/invalid-registration-token -> deletion + no retry
    deletedTokens.length = 0;
    let invalidJobCount2 = 0;
    await resetQueue();

    (QueueManager as any).executeJobLogic = async (job: any) => {
      invalidJobCount2 += 1;
      throw new InvalidFcmTokenError(job.data.token, {
        code: 'messaging/invalid-registration-token',
        message: 'invalid registration token',
      });
    };

    QueueManager.addJob('send-notification-push', {
      parentId: 'parent-y',
      token: 'token-invalid-2',
      title: 'Titre',
      message: 'Message',
      category: 'grade',
      metadata: {},
      channel: 'push',
    }, { maxAttempts: 3 });

    await delay(500);

    assert.strictEqual(invalidJobCount2, 1, 'Invalid token job should run exactly once');
    assert.deepStrictEqual(deletedTokens, [{ parentId: 'parent-y', token: 'token-invalid-2' }]);
    assert.strictEqual(activeQueue.length, 0, 'Invalid token job should not remain in active queue');
    assert.strictEqual(deadLetterQueue.length, 0, 'Invalid token job should not go to DLQ');

    // Case 3: temporary Firebase error -> retry kept
    deletedTokens.length = 0;
    await resetQueue();

    let temporaryAttempts = 0;
    (QueueManager as any).executeJobLogic = async (job: any) => {
      temporaryAttempts += 1;
      if (temporaryAttempts < 2) {
        throw new Error('Temporary FCM error');
      }
      return;
    };

    QueueManager.addJob('send-notification-push', {
      parentId: 'parent-z',
      token: 'token-temp',
      title: 'Titre',
      message: 'Message',
      category: 'grade',
      metadata: {},
      channel: 'push',
    }, { maxAttempts: 3 });

    await delay(700);

    assert.ok(temporaryAttempts >= 2, 'Temporary error should retry at least once');
    assert.strictEqual(deadLetterQueue.length, 0, 'Temporary error should not go directly to DLQ');

    // A queued job reserves its key while another job is processing.
    await resetQueue();

    const blockerStarted = deferred();
    const releaseBlocker = deferred();
    let queuedJobAttempts = 0;
    const queuedDedupeKey = 'queued-dedupe-key';
    (QueueManager as any).executeJobLogic = async (job: any) => {
      if (job.data.token === 'token-blocker') {
        blockerStarted.resolve();
        await releaseBlocker.promise;
        return;
      }
      queuedJobAttempts += 1;
    };

    QueueManager.addJob('send-notification-push', {
      parentId: 'parent-blocker',
      token: 'token-blocker',
      title: 'Titre',
      message: 'Message',
      channel: 'push',
    });
    await blockerStarted.promise;

    QueueManager.addJob('send-notification-push', {
      parentId: 'parent-queued',
      token: 'token-queued',
      title: 'Titre',
      message: 'Message',
      channel: 'push',
    }, { dedupeKey: queuedDedupeKey });
    const queuedDuplicateId = QueueManager.addJob('send-notification-push', {
      parentId: 'parent-queued',
      token: 'token-queued',
      title: 'Titre',
      message: 'Message',
      channel: 'push',
    }, { dedupeKey: queuedDedupeKey });

    assert.equal(queuedDuplicateId, `queued-${queuedDedupeKey}`);
    assert.equal(activeQueue.filter((job) => job.dedupeKey === queuedDedupeKey).length, 1);
    releaseBlocker.resolve();
    await delay(500);
    assert.equal(queuedJobAttempts, 1, 'A duplicate queued request must not execute twice');

    // The reservation also remains active after the job leaves activeQueue to execute.
    await resetQueue();

    const executionStarted = deferred();
    const finishExecution = deferred();
    let concurrentExecutionCount = 0;
    const concurrentKey = 'in-flight-dedupe-key';
    (QueueManager as any).executeJobLogic = async () => {
      concurrentExecutionCount += 1;
      executionStarted.resolve();
      await finishExecution.promise;
    };

    QueueManager.addJob('send-notification-push', {
      parentId: 'parent-concurrent',
      token: 'token-concurrent',
      title: 'Titre',
      message: 'Message',
      channel: 'push',
    }, { dedupeKey: concurrentKey });
    await executionStarted.promise;
    const concurrentDuplicateId = QueueManager.addJob('send-notification-push', {
      parentId: 'parent-concurrent',
      token: 'token-concurrent',
      title: 'Titre',
      message: 'Message',
      channel: 'push',
    }, { dedupeKey: concurrentKey });

    assert.equal(concurrentDuplicateId, `queued-${concurrentKey}`);
    finishExecution.resolve();
    await delay(300);
    assert.equal(concurrentExecutionCount, 1, 'An in-flight job must not be accepted a second time');
    assert.equal(completedJobIds.has(concurrentKey), true);

    // A transient failure retains its reservation through the scheduled retry.
    await resetQueue();

    const retryStarted = deferred();
    const finishRetry = deferred();
    let retryReservationAttempts = 0;
    const retryDedupeKey = 'retry-reservation-key';
    (QueueManager as any).executeJobLogic = async () => {
      retryReservationAttempts += 1;
      if (retryReservationAttempts === 1) {
        throw new Error('Temporary FCM error');
      }
      retryStarted.resolve();
      await finishRetry.promise;
    };

    QueueManager.addJob('send-notification-push', {
      parentId: 'parent-retry',
      token: 'token-retry',
      title: 'Titre',
      message: 'Message',
      channel: 'push',
    }, { dedupeKey: retryDedupeKey, maxAttempts: 2 });
    await retryStarted.promise;
    const retryDuplicateId = QueueManager.addJob('send-notification-push', {
      parentId: 'parent-retry',
      token: 'token-retry',
      title: 'Titre',
      message: 'Message',
      channel: 'push',
    }, { dedupeKey: retryDedupeKey, maxAttempts: 2 });
    assert.equal(retryDuplicateId, `queued-${retryDedupeKey}`);
    finishRetry.resolve();
    await delay(300);
    assert.equal(retryReservationAttempts, 2, 'A duplicate must not bypass a scheduled retry');
    assert.equal(completedJobIds.has(retryDedupeKey), true);
    assert.equal(deadLetterQueue.length, 0);

    // Case 4: parent with 3 tokens, only invalid B removed
    deletedTokens.length = 0;
    await resetQueue();

    const executionOrder: string[] = [];
    (QueueManager as any).executeJobLogic = async (job: any) => {
      executionOrder.push(job.data.token);
      if (job.data.token === 'token-b') {
        throw new InvalidFcmTokenError(job.data.token, {
          code: 'registration-token-not-registered',
          message: 'Registration token not registered',
        });
      }
      return;
    };

    const parentId = 'parent-3';
    QueueManager.addJob('send-notification-push', { parentId, token: 'token-a', title: 'T', message: 'M', category: 'grade', metadata: {}, channel: 'push' }, { maxAttempts: 3 });
    QueueManager.addJob('send-notification-push', { parentId, token: 'token-b', title: 'T', message: 'M', category: 'grade', metadata: {}, channel: 'push' }, { maxAttempts: 3 });
    QueueManager.addJob('send-notification-push', { parentId, token: 'token-c', title: 'T', message: 'M', category: 'grade', metadata: {}, channel: 'push' }, { maxAttempts: 3 });

    await delay(800);

    assert.deepStrictEqual(deletedTokens, [{ parentId, token: 'token-b' }], 'Only invalid token B should be deleted');
    assert.deepStrictEqual(executionOrder.sort(), ['token-a', 'token-b', 'token-c'].sort(), 'All three tokens must be processed');
    assert.strictEqual(deadLetterQueue.length, 0, 'None of the three jobs should go to DLQ');

    // Case 5: permanent credential mismatch -> DLQ once, without retry or token deletion
    deletedTokens.length = 0;
    await resetQueue();

    let credentialAttempts = 0;
    const mismatchDedupeKey = 'late-arrival-credential-mismatch';
    (QueueManager as any).executeJobLogic = async () => {
      credentialAttempts += 1;
      throw {
        name: 'FirebaseMessagingError',
        code: 'messaging/mismatched-credential',
      };
    };

    QueueManager.addJob('send-notification-push', {
      parentId: 'parent-mismatch',
      token: 'token-mismatch',
      title: 'Retard',
      message: 'Retard enregistré',
      category: 'absence',
      metadata: { target: 'late-arrival' },
      channel: 'push',
    }, { maxAttempts: 3, dedupeKey: mismatchDedupeKey });

    await delay(400);

    assert.strictEqual(credentialAttempts, 1, 'Permanent credential errors must not be retried');
    assert.deepStrictEqual(deletedTokens, [], 'Credential errors must not delete the device token');
    assert.strictEqual(activeQueue.length, 0, 'Permanent credential job must leave the active queue');
    assert.strictEqual(deadLetterQueue.length, 1, 'Permanent credential job must be routed to DLQ');
    assert.strictEqual(completedJobIds.has(mismatchDedupeKey), true, 'A permanent failure must retain its deduplication key');
    const duplicateAfterDlqId = QueueManager.addJob('send-notification-push', {
      parentId: 'parent-mismatch',
      token: 'token-mismatch',
      title: 'Retard',
      message: 'Retard enregistré',
      category: 'absence',
      metadata: { target: 'late-arrival' },
      channel: 'push',
    }, { maxAttempts: 3, dedupeKey: mismatchDedupeKey });
    assert.equal(duplicateAfterDlqId, `skipped-${mismatchDedupeKey}`);
    assert.strictEqual(credentialAttempts, 1, 'A permanently failed DLQ job must not be re-enqueued');
  } finally {
    (QueueManager as any).executeJobLogic = originalExecuteJobLogic;
    store.deletePushToken = originalDeletePushToken;
    await resetQueue();
  }

  console.log('FCM invalid token audit tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
