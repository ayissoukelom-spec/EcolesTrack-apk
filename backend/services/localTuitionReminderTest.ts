export type LocalTuitionReminderTestTarget = {
  schoolId: number;
  studentId: number;
  parentUserId: number;
  deviceId: string;
};

const isPositiveSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;

const isLoopbackHost = (value: string | undefined): boolean => {
  const host = value?.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
};

export const isLocalTuitionReminderTestDatabaseIdentity = (
  identity: { databaseName: string | null; serverAddress: string | null },
): boolean => {
  const address = identity.serverAddress?.trim().toLowerCase() ?? '';
  const parsedAddress = /^([^/]+)(?:\/(\d+))?$/.exec(address);
  if (!parsedAddress) return false;
  const host = parsedAddress[1];
  const prefix = parsedAddress[2] ?? null;
  const isIpv6Loopback = (host === '::1' || host === '0:0:0:0:0:0:0:1')
    && (prefix === null || prefix === '128');
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  const isIpv4Loopback = (prefix === null || prefix === '32')
    && Boolean(ipv4 && Number(ipv4[1]) === 127
      && ipv4.slice(2).every((octet) => Number(octet) >= 0 && Number(octet) <= 255));
  const databaseName = process.env.ECOLETRACK_LOCAL_TUITION_REMINDER_TEST_DATABASE_NAME?.trim();
  return Boolean(databaseName)
    && identity.databaseName === databaseName
    && (isIpv4Loopback || isIpv6Loopback);
};

export const getLocalTuitionReminderTestTargets = (
  value = process.env.ECOLETRACK_LOCAL_TUITION_REMINDER_TEST_TARGETS,
): LocalTuitionReminderTestTarget[] => {
  if (!value?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const targets: LocalTuitionReminderTestTarget[] = [];
  for (const candidate of parsed) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
    const target = candidate as Record<string, unknown>;
    if (!isPositiveSafeInteger(target.schoolId)
      || !isPositiveSafeInteger(target.studentId)
      || !isPositiveSafeInteger(target.parentUserId)
      || typeof target.deviceId !== 'string'
      || !/^\d{1,32}$/.test(target.deviceId)) return [];
    const normalized = {
      schoolId: target.schoolId,
      studentId: target.studentId,
      parentUserId: target.parentUserId,
      deviceId: target.deviceId,
    };
    if (targets.some((existing) =>
      existing.schoolId === normalized.schoolId
      && existing.studentId === normalized.studentId
      && existing.parentUserId === normalized.parentUserId
      && existing.deviceId === normalized.deviceId)) return [];
    targets.push(normalized);
  }
  return targets;
};

export const isLocalTuitionReminderTestEnvironment = (): boolean => {
  const databaseName = process.env.SQL_DB_NAME?.trim() ?? '';
  return process.env.ECOLETRACK_LOCAL_TUITION_REMINDER_TEST_ENABLED === 'true'
    && process.env.NODE_ENV === 'development'
    && !(process.env.ECOLETRACK_TUITION_PROGRESS_REMINDERS_ENABLED === 'true'
      && process.env.ECOLETRACK_TUITION_PROGRESS_REMINDERS_0800_CONFIRMED === 'true')
    && isLoopbackHost(process.env.SQL_HOST)
    && databaseName !== ''
    && databaseName === process.env.ECOLETRACK_LOCAL_TUITION_REMINDER_TEST_DATABASE_NAME?.trim()
    && !/(?:prod|production|stag|staging)/i.test(databaseName)
    && Boolean(process.env.INTERNAL_SECRET?.trim())
    && getLocalTuitionReminderTestTargets().length > 0;
};

export const isConfiguredLocalTuitionReminderTestTarget = (
  selection: LocalTuitionReminderTestTarget,
): boolean => getLocalTuitionReminderTestTargets().some((target) =>
  target.schoolId === selection.schoolId
  && target.studentId === selection.studentId
  && target.parentUserId === selection.parentUserId
  && target.deviceId === selection.deviceId);
