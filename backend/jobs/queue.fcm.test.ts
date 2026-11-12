import assert from 'node:assert/strict';
import { activeQueue, deadLetterQueue, completedJobIds, QueueManager } from './queue.ts';
import { store } from '../store.ts';
import { InvalidFcmTokenError, isInvalidFcmTokenError } from '../services/fcm.ts';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
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

    const invalidTokenKey = 'grouped-publication-invalid-token';
    const invalidTokenDelivery = QueueManager.waitForDedupeKey(invalidTokenKey);
    QueueManager.addJob('send-notification-push', {
      parentId: 'parent-x',
      token: 'token-invalid-1',
      title: 'Titre',
      message: 'Message',
      category: 'grade',
      metadata: {},
      channel: 'push',
    }, { dedupeKey: invalidTokenKey, maxAttempts: 3 });

    assert.equal(await invalidTokenDelivery, 'permanent_failure', 'Invalid device tokens should be reported as permanent failures');
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

    await resetQueue();
    const confirmedKey = 'grouped-publication-17-notification-91-push-token';
    (QueueManager as any).executeJobLogic = async () => undefined;
    const confirmedDelivery = QueueManager.waitForDedupeKey(confirmedKey);
    QueueManager.addJob('send-notification-push', {
      parentId: 'parent-grouped',
      token: 'token-confirmed',
      title: 'Programme',
      message: 'Message',
      category: 'evaluation',
      metadata: {},
      channel: 'push',
    }, { dedupeKey: confirmedKey, maxAttempts: 3 });
    assert.equal(await confirmedDelivery, 'sent', 'Queue completion should report confirmed provider success');

    await resetQueue();
    let failedAttempts = 0;
    const failedKey = 'grouped-publication-18-notification-92-push-token';
    (QueueManager as any).executeJobLogic = async () => {
      failedAttempts += 1;
      throw new Error('Temporary FCM error');
    };
    const failedDelivery = QueueManager.waitForDedupeKey(failedKey);
    QueueManager.addJob('send-notification-push', {
      parentId: 'parent-grouped',
      token: 'token-failing',
      title: 'Programme',
      message: 'Message',
      category: 'evaluation',
      metadata: {},
      channel: 'push',
    }, { dedupeKey: failedKey, maxAttempts: 2 });
    assert.equal(await failedDelivery, 'retryable_failure', 'Exhausted queue retries should be surfaced to the outbox');
    assert.equal(failedAttempts, 2, 'Dispatcher outcome should wait until the queue retry policy is exhausted');

    (QueueManager as any).executeJobLogic = async () => undefined;
    const retryAfterExhaustionJobId = QueueManager.addJob('send-notification-push', {
      parentId: 'parent-grouped',
      token: 'token-failing',
      title: 'Programme',
      message: 'Message',
      category: 'evaluation',
      metadata: {},
      channel: 'push',
    }, { dedupeKey: failedKey, maxAttempts: 2 });
    assert.ok(
      !retryAfterExhaustionJobId.startsWith('queued-') && !retryAfterExhaustionJobId.startsWith('skipped-'),
      'A retryable terminal failure should release its deduplication key for a later dispatch',
    );
    const retryAfterExhaustion = QueueManager.waitForDedupeKey(failedKey);
    assert.equal(await retryAfterExhaustion, 'sent', 'A later dispatch should be able to complete after retries are exhausted');

    await resetQueue();
    const executionStarted = deferred<void>();
    const finishExecution = deferred<void>();
    let concurrentExecutionCount = 0;
    (QueueManager as any).executeJobLogic = async () => {
      concurrentExecutionCount += 1;
      executionStarted.resolve();
      await finishExecution.promise;
    };
    const concurrentKey = 'grouped-publication-concurrent-key';
    const firstConcurrentDelivery = QueueManager.waitForDedupeKey(concurrentKey);
    try {
      QueueManager.addJob('send-notification-push', {
        parentId: 'parent-grouped',
        token: 'token-concurrent',
        title: 'Programme',
        message: 'Message',
        category: 'evaluation',
        metadata: {},
        channel: 'push',
      }, { dedupeKey: concurrentKey, maxAttempts: 2 });
      await executionStarted.promise;

      const duplicateConcurrentDelivery = QueueManager.waitForDedupeKey(concurrentKey);
      const duplicateJobId = QueueManager.addJob('send-notification-push', {
        parentId: 'parent-grouped',
        token: 'token-concurrent',
        title: 'Programme',
        message: 'Message',
        category: 'evaluation',
        metadata: {},
        channel: 'push',
      }, { dedupeKey: concurrentKey, maxAttempts: 2 });
      assert.equal(duplicateJobId, `queued-${concurrentKey}`, 'A duplicate request during execution should reuse the reserved job');

      finishExecution.resolve();
      assert.deepEqual(
        await Promise.all([firstConcurrentDelivery, duplicateConcurrentDelivery]),
        ['sent', 'sent'],
        'Concurrent callers should receive the existing job outcome',
      );
      assert.equal(concurrentExecutionCount, 1, 'Only the original job should execute for a reserved key');
    } finally {
      finishExecution.resolve();
    }

    await resetQueue();
    const retryExecutionStarted = deferred<void>();
    const finishRetryExecution = deferred<void>();
    let retryReservationAttempts = 0;
    (QueueManager as any).executeJobLogic = async () => {
      retryReservationAttempts += 1;
      if (retryReservationAttempts === 1) {
        throw new Error('Temporary FCM error');
      }
      retryExecutionStarted.resolve();
      await finishRetryExecution.promise;
    };
    const retryReservationKey = 'grouped-publication-retry-reservation';
    const retryReservationDelivery = QueueManager.waitForDedupeKey(retryReservationKey);
    QueueManager.addJob('send-notification-push', {
      parentId: 'parent-grouped',
      token: 'token-retry-reservation',
      title: 'Programme',
      message: 'Message',
      category: 'evaluation',
      metadata: {},
      channel: 'push',
    }, { dedupeKey: retryReservationKey, maxAttempts: 2 });
    await retryExecutionStarted.promise;

    const retryDuplicateDelivery = QueueManager.waitForDedupeKey(retryReservationKey);
    const retryDuplicateJobId = QueueManager.addJob('send-notification-push', {
      parentId: 'parent-grouped',
      token: 'token-retry-reservation',
      title: 'Programme',
      message: 'Message',
      category: 'evaluation',
      metadata: {},
      channel: 'push',
    }, { dedupeKey: retryReservationKey, maxAttempts: 2 });
    assert.equal(retryDuplicateJobId, `queued-${retryReservationKey}`, 'The dedupe key should remain reserved during retry execution');
    finishRetryExecution.resolve();
    assert.deepEqual(
      await Promise.all([retryReservationDelivery, retryDuplicateDelivery]),
      ['sent', 'sent'],
      'Both callers should receive the retrying job outcome',
    );
    assert.equal(retryReservationAttempts, 2, 'The retry should execute once without creating a duplicate job');

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
