import assert from 'node:assert/strict';
import { NotificationService } from './notification';
import { QueueManager } from '../jobs/queue';
import { store } from '../store';

const originalGetNotificationPreferences = store.getNotificationPreferences;
const originalGetConsentsOfParent = store.getConsentsOfParent;
const originalGetDevicesOfParent = store.getDevicesOfParent;
const originalAddJob = QueueManager.addJob;

const jobs: Array<{ name: string; data: any }> = [];

try {
  QueueManager.addJob = ((name: string, data: any) => {
    jobs.push({ name, data });
    return `job-${jobs.length}`;
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

  console.log('notification dispatch regression test passed');
} finally {
  store.getNotificationPreferences = originalGetNotificationPreferences;
  store.getConsentsOfParent = originalGetConsentsOfParent;
  store.getDevicesOfParent = originalGetDevicesOfParent;
  QueueManager.addJob = originalAddJob;
}
