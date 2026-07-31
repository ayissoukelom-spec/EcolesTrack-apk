import assert from 'node:assert/strict';
import { activeQueue, deadLetterQueue, completedJobIds, QueueManager } from './queue.ts';
import { store } from '../store.ts';
import { InvalidFcmTokenError, isInvalidFcmTokenError } from '../services/fcm.ts';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
