import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isTuitionProgressPushRequest,
  sendTuitionProgressReminderPush,
  type TuitionProgressPushDependencies,
  type TuitionProgressPushRequest,
} from './tuitionProgressPush';

const request: TuitionProgressPushRequest = {
  parentId: '91',
  notificationId: 81,
  title: 'Information sur les frais',
  body: 'La progression reste inférieure à l’objectif théorique.',
  dedupeKey: 'tuition-progress-reminder:101',
  controlId: 101,
  schoolId: 7,
  academicYearId: 23,
  cycleId: 4,
  studentId: 31,
  scheduledAt: '2027-07-16T08:00:00.000Z',
  expiresAt: '2027-07-16T22:59:59.999Z',
  timeZone: 'Africa/Lome',
};

const createDependencies = (options: {
  reservation?: TuitionProgressPushDependencies['store']['reserveTuitionProgressPushDeviceDelivery'];
  authorized?: () => Promise<boolean>;
  deviceAssociated?: () => Promise<boolean>;
  testDeviceAssociated?: () => Promise<boolean>;
  pushEnabled?: () => Promise<boolean>;
  devices?: Array<{
    id: string;
    parentId: string;
    platform: 'android' | 'ios';
    pushToken: string;
    appVersion: string;
    lastSeenAt: string;
  }>;
  send?: TuitionProgressPushDependencies['send'];
  classify?: TuitionProgressPushDependencies['classifyFcmError'];
  now?: Date;
} = {}) => {
  const reservations: Array<{ parentId: string; dedupeKey: string; payload: Record<string, unknown> }> = [];
  const updates: Array<Parameters<TuitionProgressPushDependencies['store']['updateTuitionProgressPushDeviceDelivery']>[0]> = [];
  const deletedTokens: Array<{ parentId: string; token?: string }> = [];
  const dependencies: TuitionProgressPushDependencies = {
    store: {
      isAuthorizedTuitionProgressPushRecipient: options.authorized ?? (async () => true),
      isPushChannelEnabled: options.pushEnabled ?? (async () => true),
      isPushDeviceAssociated: options.deviceAssociated ?? (async () => true),
      isPushDeviceIdAndTokenAssociated: options.testDeviceAssociated ?? (async () => true),
      deletePushToken: async (parentId, token) => {
        deletedTokens.push({ parentId, token });
      },
      getDevicesOfParent: async () => options.devices ?? [{
        id: 'device-1',
        parentId: request.parentId,
        platform: 'android',
        pushToken: 'test-fcm-token',
        appVersion: '1.0',
        lastSeenAt: '2027-07-15T00:00:00.000Z',
      }],
      reserveTuitionProgressPushDeviceDelivery: options.reservation ?? (async (input) => {
        reservations.push(input);
        return { kind: 'send', deliveryId: 'delivery-1' };
      }),
      updateTuitionProgressPushDeviceDelivery: async (input) => {
        updates.push(input);
      },
    },
    send: options.send ?? (async () => 'fcm-message-1'),
    clock: () => options.now ?? new Date('2027-07-16T12:00:00.000Z'),
    classifyFcmError: options.classify,
  };
  return { dependencies, reservations, updates, deletedTokens };
};

test('rejects invalid recipient scope without submitting a push', async () => {
  const { dependencies } = createDependencies({ authorized: async () => false });
  let sent = false;
  dependencies.send = async () => {
    sent = true;
    return 'message';
  };

  assert.deepEqual(await sendTuitionProgressReminderPush(request, dependencies), {
    status: 'permanent_failure',
    error: 'recipient_scope_invalid',
  });
  assert.equal(sent, false);
});

test('does not submit pushes for an expired control or during system quiet hours', async () => {
  const expired = createDependencies({ now: new Date('2027-07-16T23:00:00.000Z') });
  assert.deepEqual(await sendTuitionProgressReminderPush(request, expired.dependencies), {
    status: 'permanent_failure',
    error: 'control_expired',
  });

  let sent = false;
  const quiet = createDependencies({
    now: new Date('2027-07-16T23:00:00.000Z'),
    send: async () => {
      sent = true;
      return 'message';
    },
  });
  const quietRequest = { ...request, expiresAt: '2027-07-17T10:00:00.000Z' };
  assert.deepEqual(await sendTuitionProgressReminderPush(quietRequest, quiet.dependencies), {
    status: 'deferred',
  });
  assert.equal(sent, false);
});

test('refuses disabled push preferences and does not infer a delivery permission from a token', async () => {
  let sent = false;
  const disabled = createDependencies({
    pushEnabled: async () => false,
    send: async () => {
      sent = true;
      return 'message';
    },
  });
  assert.deepEqual(await sendTuitionProgressReminderPush(request, disabled.dependencies), {
    status: 'no_subscription',
    error: 'push_disabled_for_parent',
  });
  assert.equal(sent, false);

  const enabled = createDependencies({
    send: async () => {
      sent = true;
      return 'message';
    },
  });
  assert.deepEqual(await sendTuitionProgressReminderPush(request, enabled.dependencies), {
    status: 'fcm_accepted',
    acceptedDeviceCount: 1,
  });
  assert.equal(sent, true);
});

test('routes tuition progress reminders to the payment menu', async () => {
  let sentTarget: string | undefined;
  const { dependencies } = createDependencies({
    send: async (_token, _title, _body, target) => {
      sentTarget = target;
      return 'fcm-message-1';
    },
  });

  assert.deepEqual(await sendTuitionProgressReminderPush(request, dependencies), {
    status: 'fcm_accepted',
    acceptedDeviceCount: 1,
  });
  assert.equal(sentTarget, 'payment');
});

test('revalidates parent and device associations before FCM and uses a stable device hash for idempotency', async () => {
  let checks = 0;
  const { dependencies, reservations } = createDependencies({
    authorized: async () => {
      checks += 1;
      return true;
    },
  });

  test('local test push honors the simulated time and submits only the allowlisted device', async () => {
    const testRequest: TuitionProgressPushRequest = {
      ...request,
      testDeviceId: '123',
      simulationNow: '2027-07-16T08:00:00.000Z',
    };
    const sentTokens: string[] = [];
    const { dependencies, reservations } = createDependencies({
      now: new Date('2027-07-16T23:30:00.000Z'),
      devices: [
        {
          id: '123',
          parentId: request.parentId,
          platform: 'android',
          pushToken: 'test-device-token',
          appVersion: '1.0',
          lastSeenAt: '2027-07-15T00:00:00.000Z',
        },
        {
          id: '456',
          parentId: request.parentId,
          platform: 'ios',
          pushToken: 'other-device-token',
          appVersion: '1.0',
          lastSeenAt: '2027-07-16T00:00:00.000Z',
        },
      ],
      send: async (token) => {
        sentTokens.push(token);
        return 'fcm-message-1';
      },
    });

    assert.deepEqual(await sendTuitionProgressReminderPush(testRequest, dependencies), {
      status: 'fcm_accepted',
      acceptedDeviceCount: 1,
    });
    assert.deepEqual(sentTokens, ['test-device-token']);
    assert.equal(reservations.length, 1);
  });

  test('accepts test-only device and simulated-time fields only as a complete pair', () => {
    const testRequest = {
      ...request,
      testDeviceId: '123',
      simulationNow: '2027-07-16T08:00:00.000Z',
    };
    assert.equal(isTuitionProgressPushRequest(testRequest), true);
    assert.equal(isTuitionProgressPushRequest({ ...testRequest, simulationNow: undefined }), false);
    assert.equal(isTuitionProgressPushRequest({ ...testRequest, testDeviceId: 'not-an-id' }), false);
  });

  await sendTuitionProgressReminderPush(request, dependencies);
  assert.equal(checks, 2);
  assert.equal(reservations.length, 1);
  assert.match(reservations[0].dedupeKey, /^tuition-progress-reminder:101:device:[a-f0-9]{64}$/);
  assert.equal(reservations[0].dedupeKey.includes('test-fcm-token'), false);
});

test('does not replay an accepted or uncertain device delivery', async () => {
  let sendCount = 0;
  const accepted = createDependencies({
    reservation: async () => ({ kind: 'fcm_accepted' }),
    send: async () => {
      sendCount += 1;
      return 'message';
    },
  });
  assert.deepEqual(await sendTuitionProgressReminderPush(request, accepted.dependencies), {
    status: 'fcm_accepted',
    acceptedDeviceCount: 1,
  });

  const uncertain = createDependencies({
    reservation: async () => ({ kind: 'uncertain' }),
    send: async () => {
      sendCount += 1;
      return 'message';
    },
  });
  assert.deepEqual(await sendTuitionProgressReminderPush(request, uncertain.dependencies), {
    status: 'uncertain',
    error: 'existing_push_attempt_outcome_unknown',
  });
  assert.equal(sendCount, 0);
});

test('persists transient FCM failures for retry and never claims delivery confirmation', async () => {
  const { dependencies, updates } = createDependencies({
    send: async () => {
      throw Object.assign(new Error('temporary FCM outage'), { code: 'messaging/server-unavailable' });
    },
  });
  assert.deepEqual(await sendTuitionProgressReminderPush(request, dependencies), {
    status: 'retryable_failure',
    error: 'fcm_transient_failure',
  });
  assert.deepEqual(updates, [{
    deliveryId: 'delivery-1',
    status: 'retryable_failure',
    errorCode: 'messaging/server-unavailable',
    errorMessage: 'temporary FCM outage',
  }]);

  const unknown = createDependencies({
    send: async () => {
      throw new Error('connection lost after submission');
    },
  });
  assert.deepEqual(await sendTuitionProgressReminderPush(request, unknown.dependencies), {
    status: 'uncertain',
    error: 'fcm_outcome_unknown',
  });
  assert.equal(unknown.updates[0].status, 'uncertain');
});

test('removes an FCM-invalid token without changing the in-app notification', async () => {
  const { dependencies, deletedTokens, updates } = createDependencies({
    send: async () => {
      throw Object.assign(new Error('Invalid FCM registration token'), {
        code: 'messaging/registration-token-not-registered',
      });
    },
  });
  dependencies.classifyFcmError = () => 'invalid_token';

  assert.deepEqual(await sendTuitionProgressReminderPush(request, dependencies), {
    status: 'permanent_failure',
    error: 'all_registered_devices_failed',
  });
  assert.deepEqual(deletedTokens, [{ parentId: request.parentId, token: 'test-fcm-token' }]);
  assert.equal(updates[0].status, 'failed');
});
