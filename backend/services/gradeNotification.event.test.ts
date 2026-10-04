import assert from 'node:assert/strict';
import { NotificationService } from '../services/notification';
import { QueueManager } from '../jobs/queue';
import { store } from '../store';

const originalGetNotificationPreferences = store.getNotificationPreferences;
const originalGetConsentsOfParent = store.getConsentsOfParent;
const originalGetDevicesOfParent = store.getDevicesOfParent;
const originalAddJob = QueueManager.addJob;

const interceptedJobs: Array<{ name: string; data: any; dedupeKey?: string }> = [];

try {
  QueueManager.addJob = ((name: string, data: any, options?: any) => {
    interceptedJobs.push({ name, data, dedupeKey: options?.dedupeKey });
    return `job-${interceptedJobs.length}`;
  }) as typeof QueueManager.addJob;

  store.getNotificationPreferences = async (parentId: string) => ({
    parentId,
    pushEnabled: true,
    smsEnabled: false,
    whatsappEnabled: false,
    quietHoursStart: null,
    quietHoursEnd: null,
  }) as any;

  store.getConsentsOfParent = async () => [] as any;
  store.getDevicesOfParent = async (parentId: string) => {
    return [{ parentId, pushToken: 'token-abc', platform: 'android', appVersion: '1.0' }] as any;
  };

  // Test 1: Creation and first modification of same grade should have different dedupeKeys
  (async () => {
    interceptedJobs.length = 0;

    // Simulate creation event (editCount=0)
    await NotificationService.dispatchNotification(
      'parent-x',
      'Nouvelle note',
      'Message de création',
      'grade',
      {
        target: 'notes',
        gradeId: 50,
        eventVersion: 0,
        studentId: 10,
        evaluationId: 5,
        isGradeModification: false,
      },
      'grade-50-event-0'
    );

    const creationJobs = interceptedJobs.filter((job) => job.name.includes('push'));
    assert.strictEqual(creationJobs.length, 1, 'Expected 1 creation push job');
    assert.ok(creationJobs[0].dedupeKey?.includes('grade-50-event-0'), 'Creation dedupeKey should contain event-0');

    // Simulate first modification event (editCount=1)
    await NotificationService.dispatchNotification(
      'parent-x',
      'Note modifiée',
      'Message de modification',
      'grade',
      {
        target: 'notes',
        gradeId: 50,
        eventVersion: 1,
        studentId: 10,
        evaluationId: 5,
        isGradeModification: true,
      },
      'grade-50-event-1'
    );

    const modificationJobs = interceptedJobs.filter((job) => job.name.includes('push'));
    assert.strictEqual(modificationJobs.length, 2, 'Expected 2 push jobs total');
    assert.ok(modificationJobs[1].dedupeKey?.includes('grade-50-event-1'), 'Modification dedupeKey should contain event-1');

    // Keys must be different
    assert.notStrictEqual(modificationJobs[0].dedupeKey, modificationJobs[1].dedupeKey, 'Creation and modification must have different keys');
    console.log('✓ Creation and first modification of same grade have different dedupeKeys');
  })();

  // Test 2: Retry of same event should reuse identical dedupeKey
  (async () => {
    interceptedJobs.length = 0;

    const dedupeKeyForRetry = 'grade-50-event-1';

    // First attempt
    await NotificationService.dispatchNotification(
      'parent-x',
      'Note modifiée',
      'Message',
      'grade',
      {
        target: 'notes',
        gradeId: 50,
        eventVersion: 1,
      },
      dedupeKeyForRetry
    );

    const firstAttemptKey = interceptedJobs.find((job) => job.name.includes('push'))?.dedupeKey;

    // Immediate retry (same grade, same modification)
    await NotificationService.dispatchNotification(
      'parent-x',
      'Note modifiée',
      'Message',
      'grade',
      {
        target: 'notes',
        gradeId: 50,
        eventVersion: 1,
      },
      dedupeKeyForRetry
    );

    const jobs = interceptedJobs.filter((job) => job.name.includes('push'));
    assert.ok(jobs.length >= 2, 'Expected at least 2 push job attempts');
    assert.strictEqual(jobs[0].dedupeKey, jobs[1].dedupeKey, 'Retries of same event should reuse identical key');
    console.log('✓ Retry of same event reuses identical dedupeKey');
  })();

  // Test 3: eventVersion must be present in metadata for traceability
  (async () => {
    interceptedJobs.length = 0;

    await NotificationService.dispatchNotification(
      'parent-x',
      'Note',
      'Message',
      'grade',
      {
        target: 'notes',
        gradeId: 100,
        eventVersion: 3,
      },
      'grade-100-event-3'
    );

    const jobs = interceptedJobs.filter((job) => job.name.includes('push'));
    assert.ok(jobs.length >= 1, 'Expected at least 1 push job');
    assert.strictEqual(jobs[0].data?.metadata?.eventVersion, 3, 'eventVersion should be in metadata');
    assert.strictEqual(jobs[0].data?.metadata?.gradeId, 100, 'gradeId should be in metadata');
    console.log('✓ eventVersion and gradeId are present in metadata for traceability');
  })();

  console.log('✓ Grade notification event deduplication tests passed');
} catch (error) {
  console.error('Grade notification event deduplication tests failed:', error);
  process.exitCode = 1;
} finally {
  store.getNotificationPreferences = originalGetNotificationPreferences;
  store.getConsentsOfParent = originalGetConsentsOfParent;
  store.getDevicesOfParent = originalGetDevicesOfParent;
  QueueManager.addJob = originalAddJob;
}
