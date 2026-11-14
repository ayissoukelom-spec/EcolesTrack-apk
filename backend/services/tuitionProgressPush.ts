import { createHash } from 'crypto';
import type { ParentDevice } from '../../src/types';
import type { TuitionProgressPushDeviceReservation } from '../store';

export type TuitionProgressPushRequest = {
  parentId: string;
  notificationId: number;
  title: string;
  body: string;
  dedupeKey: string;
  controlId: number;
  schoolId: number;
  academicYearId: number;
  cycleId: number;
  studentId: number;
  scheduledAt: string;
  expiresAt: string;
  timeZone: string;
  testDeviceId?: string;
  simulationNow?: string;
};

export type TuitionProgressPushStore = {
  isAuthorizedTuitionProgressPushRecipient: (input: {
    parentId: string;
    schoolId: number;
    academicYearId: number;
    cycleId: number;
    studentId: number;
  }) => Promise<boolean>;
  isPushChannelEnabled: (parentId: string) => Promise<boolean>;
  isPushDeviceAssociated: (parentId: string, token: string) => Promise<boolean>;
  isPushDeviceIdAndTokenAssociated: (parentId: string, deviceId: string, token: string) => Promise<boolean>;
  getDevicesOfParent: (parentId: string) => Promise<ParentDevice[]>;
  deletePushToken: (parentId: string, token?: string) => Promise<void>;
  reserveTuitionProgressPushDeviceDelivery: (input: {
    parentId: string;
    dedupeKey: string;
    payload: Record<string, unknown>;
  }) => Promise<TuitionProgressPushDeviceReservation>;
  updateTuitionProgressPushDeviceDelivery: (input: {
    deliveryId: string;
    status: 'fcm_accepted' | 'retryable_failure' | 'uncertain' | 'failed';
    providerMessageId?: string;
    errorCode?: string;
    errorMessage?: string;
  }) => Promise<void>;
};

export type TuitionProgressPushResult =
  | { status: 'fcm_accepted'; acceptedDeviceCount: number }
  | { status: 'retryable_failure'; error: string }
  | { status: 'uncertain'; error: string }
  | { status: 'no_subscription'; error: string }
  | { status: 'permanent_failure'; error: string }
  | { status: 'deferred' };

export type TuitionProgressPushDependencies = {
  store: TuitionProgressPushStore;
  send: (
    token: string,
    title: string,
    body: string,
    target: string,
    metadata: Record<string, unknown>,
  ) => Promise<string>;
  clock?: () => Date;
  classifyFcmError?: (error: unknown) => 'invalid_token' | 'permanent' | 'retryable' | 'unknown';
};

const isValidDate = (date: Date): boolean => Number.isFinite(date.getTime());

const isValidTimeZone = (timeZone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
};

const isInSystemQuietHours = (now: Date, timeZone: string): boolean => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error('Unable to determine local quiet-hours time.');
  }
  const localMinutes = hour * 60 + minute;
  return localMinutes >= 22 * 60 || localMinutes < 7 * 60;
};

const errorCode = (error: unknown): string => {
  if (!error || typeof error !== 'object') return 'fcm_unknown_error';
  const value = (error as { code?: unknown; errorInfo?: { code?: unknown } }).code
    ?? (error as { errorInfo?: { code?: unknown } }).errorInfo?.code;
  return typeof value === 'string' ? value.slice(0, 100) : 'fcm_unknown_error';
};

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message.slice(0, 1000) : 'FCM transport failed.';

export const isTuitionProgressPushRequest = (value: unknown): value is TuitionProgressPushRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  const ids = [
    request.notificationId,
    request.controlId,
    request.schoolId,
    request.academicYearId,
    request.cycleId,
    request.studentId,
  ];
  if (typeof request.scheduledAt !== 'string' || typeof request.expiresAt !== 'string') return false;
  const scheduledAt = new Date(request.scheduledAt);
  const expiresAt = new Date(request.expiresAt);
  const hasTestDevice = typeof request.testDeviceId === 'string';
  const hasSimulationNow = typeof request.simulationNow === 'string';
  const simulationNow = hasSimulationNow ? new Date(String(request.simulationNow)) : null;
  return typeof request.parentId === 'string'
    && /^\d+$/.test(request.parentId)
    && ids.every((id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
    && typeof request.dedupeKey === 'string'
    && request.dedupeKey === `tuition-progress-reminder:${request.controlId}`
    && typeof request.title === 'string' && request.title.trim().length > 0 && request.title.length <= 160
    && typeof request.body === 'string' && request.body.trim().length > 0 && request.body.length <= 2000
    && isValidDate(scheduledAt)
    && isValidDate(expiresAt)
    && scheduledAt.getTime() < expiresAt.getTime()
    && typeof request.timeZone === 'string'
    && request.timeZone.length <= 128
    && isValidTimeZone(request.timeZone)
    && hasTestDevice === hasSimulationNow
    && (!hasTestDevice || (
      typeof request.testDeviceId === 'string'
      && /^\d+$/.test(request.testDeviceId)
      && request.testDeviceId.length <= 32
      && simulationNow instanceof Date
      && isValidDate(simulationNow)
      && simulationNow.toISOString() === request.simulationNow
    ));
};

const defaultClassifyFcmError = (error: unknown): 'invalid_token' | 'permanent' | 'retryable' | 'unknown' => {
  if (!error || typeof error !== 'object') return 'unknown';
  const rawCode = (error as { code?: unknown; errorInfo?: { code?: unknown } }).code
    ?? (error as { errorInfo?: { code?: unknown } }).errorInfo?.code;
  const code = typeof rawCode === 'string' ? rawCode.toLowerCase() : '';
  if (code === 'messaging/registration-token-not-registered'
    || code === 'messaging/invalid-registration-token') return 'invalid_token';
  if (code === 'messaging/mismatched-credential' || code === 'messaging/sender-id-mismatch') return 'permanent';
  if (code === 'messaging/server-unavailable'
    || code === 'messaging/internal-error'
    || code === 'messaging/quota-exceeded') return 'retryable';
  return 'unknown';
};

const recordOutcome = async (
  store: TuitionProgressPushStore,
  deliveryId: string,
  status: 'fcm_accepted' | 'retryable_failure' | 'uncertain' | 'failed',
  details: { providerMessageId?: string; errorCode?: string; errorMessage?: string } = {},
): Promise<void> => store.updateTuitionProgressPushDeviceDelivery({
  deliveryId,
  status,
  ...details,
});

export const sendTuitionProgressReminderPush = async (
  requestValue: unknown,
  dependencies: TuitionProgressPushDependencies,
): Promise<TuitionProgressPushResult> => {
  if (!isTuitionProgressPushRequest(requestValue)) {
    return { status: 'permanent_failure', error: 'invalid_push_request' };
  }
  const request = requestValue;
  const clock = request.simulationNow
    ? () => new Date(request.simulationNow!)
    : dependencies.clock ?? (() => new Date());
  const now = clock();
  if (!isValidDate(now)) throw new Error('The tuition push clock returned an invalid timestamp.');
  if (new Date(request.scheduledAt).getTime() > now.getTime()) return { status: 'deferred' };
  if (new Date(request.expiresAt).getTime() <= now.getTime()) {
    return { status: 'permanent_failure', error: 'control_expired' };
  }
  if (isInSystemQuietHours(now, request.timeZone)) return { status: 'deferred' };

  const authorized = await dependencies.store.isAuthorizedTuitionProgressPushRecipient({
    parentId: request.parentId,
    schoolId: request.schoolId,
    academicYearId: request.academicYearId,
    cycleId: request.cycleId,
    studentId: request.studentId,
  });
  if (!authorized) return { status: 'permanent_failure', error: 'recipient_scope_invalid' };
  if (!await dependencies.store.isPushChannelEnabled(request.parentId)) {
    return { status: 'no_subscription', error: 'push_disabled_for_parent' };
  }

  const allDevices = await dependencies.store.getDevicesOfParent(request.parentId);
  const devices = request.testDeviceId
    ? allDevices.filter((device) => device.id === request.testDeviceId)
    : allDevices;
  if (request.testDeviceId && devices.length !== 1) {
    return { status: 'permanent_failure', error: 'test_device_not_associated' };
  }
  const targets: Array<{ deviceId: string; token: string }> = [];
  const seenTokens = new Set<string>();
  for (const device of devices) {
    const token = typeof device.pushToken === 'string' ? device.pushToken.trim() : '';
    if (!token || seenTokens.has(token)) continue;
    if (typeof device.id !== 'string' || !device.id.trim()) {
      return { status: 'permanent_failure', error: 'invalid_device_association' };
    }
    seenTokens.add(token);
    targets.push({ deviceId: device.id, token });
  }
  if (targets.length === 0) return { status: 'no_subscription', error: 'no_registered_push_device' };

  let acceptedDeviceCount = 0;
  let retryableFailure = false;
  let permanentFailureCount = 0;
  for (const { deviceId, token } of targets) {
    const sendNow = clock();
    if (!isValidDate(sendNow)) throw new Error('The tuition push clock returned an invalid timestamp.');
    if (new Date(request.expiresAt).getTime() <= sendNow.getTime()) {
      return { status: 'permanent_failure', error: 'control_expired' };
    }
    if (isInSystemQuietHours(sendNow, request.timeZone)) return { status: 'deferred' };
    const deviceHash = createHash('sha256').update(deviceId).digest('hex');
    const dedupeKey = `${request.dedupeKey}:device:${deviceHash}`;
    const reservation = await dependencies.store.reserveTuitionProgressPushDeviceDelivery({
      parentId: request.parentId,
      dedupeKey,
      payload: {
        notificationId: request.notificationId,
        controlId: request.controlId,
        schoolId: request.schoolId,
        academicYearId: request.academicYearId,
        cycleId: request.cycleId,
        studentId: request.studentId,
        title: request.title,
        body: request.body,
        channel: 'push',
      },
    });
    if (reservation.kind === 'fcm_accepted') {
      acceptedDeviceCount += 1;
      continue;
    }
    if (reservation.kind === 'uncertain') {
      return { status: 'uncertain', error: 'existing_push_attempt_outcome_unknown' };
    }
    if (reservation.kind === 'permanent_failure') {
      permanentFailureCount += 1;
      continue;
    }

    const beforeSend = clock();
    if (!isValidDate(beforeSend)) throw new Error('The tuition push clock returned an invalid timestamp.');
    if (new Date(request.expiresAt).getTime() <= beforeSend.getTime()) {
      await recordOutcome(dependencies.store, reservation.deliveryId, 'failed', {
        errorCode: 'control_expired',
        errorMessage: 'The tuition progress control expired before push submission.',
      });
      return { status: 'permanent_failure', error: 'control_expired' };
    }
    if (isInSystemQuietHours(beforeSend, request.timeZone)) {
      await recordOutcome(dependencies.store, reservation.deliveryId, 'retryable_failure', {
        errorCode: 'system_quiet_hours',
        errorMessage: 'Push submission postponed by system quiet hours.',
      });
      return { status: 'deferred' };
    }
    const recipientStillAuthorized = await dependencies.store.isAuthorizedTuitionProgressPushRecipient({
      parentId: request.parentId,
      schoolId: request.schoolId,
      academicYearId: request.academicYearId,
      cycleId: request.cycleId,
      studentId: request.studentId,
    });
    const deviceStillAssociated = request.testDeviceId
      ? await dependencies.store.isPushDeviceIdAndTokenAssociated(
        request.parentId,
        request.testDeviceId,
        token,
      )
      : await dependencies.store.isPushDeviceAssociated(request.parentId, token);
    if (!recipientStillAuthorized || !deviceStillAssociated) {
      await recordOutcome(dependencies.store, reservation.deliveryId, 'failed', {
        errorCode: 'recipient_or_device_association_invalid',
        errorMessage: 'The parent or device association is no longer valid.',
      });
      return { status: 'permanent_failure', error: 'recipient_or_device_association_invalid' };
    }

    try {
      const messageId = await dependencies.send(
        token,
        request.title,
        request.body,
        'home',
        { notificationId: request.notificationId },
      );
      if (typeof messageId !== 'string' || !messageId.trim()) {
        await recordOutcome(dependencies.store, reservation.deliveryId, 'uncertain', {
          errorCode: 'fcm_missing_message_id',
          errorMessage: 'FCM returned no message identifier.',
        });
        return { status: 'uncertain', error: 'fcm_missing_message_id' };
      }
      await recordOutcome(dependencies.store, reservation.deliveryId, 'fcm_accepted', {
        providerMessageId: messageId,
      });
      acceptedDeviceCount += 1;
    } catch (error) {
      const classification = (dependencies.classifyFcmError ?? defaultClassifyFcmError)(error);
      if (classification === 'invalid_token') {
        await recordOutcome(dependencies.store, reservation.deliveryId, 'failed', {
          errorCode: errorCode(error),
          errorMessage: errorText(error),
        });
        await dependencies.store.deletePushToken(request.parentId, token);
        permanentFailureCount += 1;
      } else if (classification === 'permanent') {
        await recordOutcome(dependencies.store, reservation.deliveryId, 'failed', {
          errorCode: errorCode(error),
          errorMessage: errorText(error),
        });
        permanentFailureCount += 1;
      } else if (classification === 'retryable') {
        await recordOutcome(dependencies.store, reservation.deliveryId, 'retryable_failure', {
          errorCode: errorCode(error),
          errorMessage: errorText(error),
        });
        retryableFailure = true;
      } else {
        await recordOutcome(dependencies.store, reservation.deliveryId, 'uncertain', {
          errorCode: errorCode(error),
          errorMessage: errorText(error),
        });
        return { status: 'uncertain', error: 'fcm_outcome_unknown' };
      }
    }
  }

  if (retryableFailure) return { status: 'retryable_failure', error: 'fcm_transient_failure' };
  if (acceptedDeviceCount > 0) return { status: 'fcm_accepted', acceptedDeviceCount };
  return permanentFailureCount > 0
    ? { status: 'permanent_failure', error: 'all_registered_devices_failed' }
    : { status: 'no_subscription', error: 'no_registered_push_device' };
};
