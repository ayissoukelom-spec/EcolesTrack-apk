import assert from 'node:assert/strict';
import { NotificationService } from './notification';
import { QueueManager } from '../jobs/queue';
import { store } from '../store';

const originalGetNotificationPreferences = store.getNotificationPreferences;
const originalGetConsentsOfParent = store.getConsentsOfParent;
const originalGetDevicesOfParent = store.getDevicesOfParent;
const originalAddJob = QueueManager.addJob;
const originalWaitForDedupeKey = QueueManager.waitForDedupeKey;

const jobs: Array<{ name: string; data: any; options?: any }> = [];

try {
  QueueManager.addJob = ((name: string, data: any, options?: any) => {
    jobs.push({ name, data, options });
    return `job-${jobs.length}`;
  }) as typeof QueueManager.addJob;
  let groupedTokenOutcome = 0;
  QueueManager.waitForDedupeKey = (async () => {
    groupedTokenOutcome += 1;
    return groupedTokenOutcome === 1 ? 'sent' : 'retryable_failure';
  }) as typeof QueueManager.waitForDedupeKey;

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
    if (parentId === 'parent-a') {
      return [
        { parentId, pushToken: 'token-a-1' },
        { parentId, pushToken: 'token-a-2' },
      ] as any;
    }

    if (parentId === 'parent-b') {
      return [{ parentId, pushToken: 'token-b-1' }] as any;
    }

    return [] as any;
  };

  await NotificationService.dispatchNotification(
    ['parent-a', 'parent-b'],
    'Titre',
    'Message',
    'info',
    { target: 'announcement' },
    'dedupe-test'
  );

  const pushJobs = jobs.filter((job) => job.name === 'send-notification-push');
  assert.equal(pushJobs.length, 3, 'Expected one push job per valid token');
  assert.deepEqual(
    pushJobs.map((job) => job.data.token).sort(),
    ['token-a-1', 'token-a-2', 'token-b-1'],
    'Expected all device tokens for all parents to be queued'
  );
  assert.ok(
    pushJobs.every((job) => job.data.category === 'info' && job.data.target === 'announcement'),
    'Information notifications should queue push jobs for the supplied recipients'
  );

  jobs.length = 0;
  const noTokenResult = await NotificationService.dispatchNotification(
    'parent-without-device',
    'Paiement enregistré',
    'Un paiement a été enregistré. Consultez l’application pour le détail.',
    'info',
    { target: 'payment', paymentId: '100' },
    'accounting-payment-100'
  );
  assert.equal(noTokenResult.channels.length, 0, 'A parent without a registered token should not be reported as receiving push');
  assert.equal(jobs.length, 0, 'A parent without a registered token should not receive a push job');

  jobs.length = 0;
  store.getNotificationPreferences = async (parentId: string) => ({
    parentId,
    pushEnabled: true,
    smsEnabled: true,
    whatsappEnabled: true,
    quietHoursStart: null,
    quietHoursEnd: null,
  }) as any;
  store.getConsentsOfParent = async () => [
    { channel: 'sms', consentGranted: true },
    { channel: 'whatsapp', consentGranted: true },
  ] as any;
  store.getDevicesOfParent = async (parentId: string) => [
    { parentId, pushToken: 'grouped-token-a' },
    { parentId, pushToken: 'grouped-token-b' },
    { parentId, pushToken: 'grouped-token-a' },
  ] as any;

  const groupedResult = await NotificationService.dispatchNotification(
    'parent-grouped',
    'Nouveau programme de devoirs',
    'Un programme de devoirs a été publié.',
    'evaluation',
    { target: 'homework', publicationId: 17, notificationId: 91 },
    'grouped-publication-17-notification-91',
    { pushOnly: true, awaitPushDelivery: true },
  );
  const groupedJobs = jobs.filter((job) => job.name === 'send-notification-push');
  assert.equal(groupedResult.deliveryOutcome, 'sent', 'A confirmed delivery to one device should count as delivered for the parent');
  assert.equal(groupedJobs.length, 2, 'Grouped delivery should enqueue once per unique device token');
  assert.ok(groupedJobs.every((job) => job.data.category === 'evaluation' && job.data.target === 'homework'));
  assert.ok(groupedJobs.every((job) => job.options?.dedupeKey?.startsWith('grouped-publication-17-notification-91-push-')));
  assert.equal(jobs.length, 2, 'Grouped delivery must not enqueue SMS or WhatsApp jobs');

  QueueManager.waitForDedupeKey = (async () => 'retryable_failure') as typeof QueueManager.waitForDedupeKey;
  const retryResult = await NotificationService.dispatchNotification(
    'parent-grouped',
    'Nouveau programme de devoirs',
    'Un programme de devoirs a été publié.',
    'evaluation',
    { target: 'homework' },
    'grouped-publication-18-notification-92',
    { pushOnly: true, awaitPushDelivery: true },
  );
  assert.equal(retryResult.deliveryOutcome, 'retryable_failure', 'Provider failures must be surfaced for outbox retry');

  store.getNotificationPreferences = async (parentId: string) => ({
    parentId,
    pushEnabled: false,
    smsEnabled: true,
    whatsappEnabled: true,
    quietHoursStart: null,
    quietHoursEnd: null,
  }) as any;
  jobs.length = 0;
  const disabledPushResult = await NotificationService.dispatchNotification(
    'parent-grouped',
    'Nouveau programme de devoirs',
    'Un programme de devoirs a été publié.',
    'evaluation',
    { target: 'homework' },
    'grouped-publication-19-notification-93',
    { pushOnly: true, awaitPushDelivery: true },
  );
  assert.equal(disabledPushResult.deliveryOutcome, 'no_subscription');
  assert.equal(jobs.length, 0, 'Disabled push must not enqueue push, SMS, or WhatsApp jobs');

  console.log('notification dispatch regression test passed');
} finally {
  store.getNotificationPreferences = originalGetNotificationPreferences;
  store.getConsentsOfParent = originalGetConsentsOfParent;
  store.getDevicesOfParent = originalGetDevicesOfParent;
  QueueManager.addJob = originalAddJob;
  QueueManager.waitForDedupeKey = originalWaitForDedupeKey;
}
