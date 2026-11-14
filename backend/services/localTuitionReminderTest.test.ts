import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getLocalTuitionReminderTestTargets,
  isConfiguredLocalTuitionReminderTestTarget,
  isLocalTuitionReminderTestDatabaseIdentity,
  isLocalTuitionReminderTestEnvironment,
} from './localTuitionReminderTest';

const target = { schoolId: 1, studentId: 2, parentUserId: 3, deviceId: '42' };

test('parses only complete numeric-device local test target tuples', () => {
  assert.deepEqual(getLocalTuitionReminderTestTargets(JSON.stringify([target])), [target]);
  assert.deepEqual(getLocalTuitionReminderTestTargets('{'), []);
  assert.deepEqual(getLocalTuitionReminderTestTargets(JSON.stringify([{ ...target, deviceId: 'device-42' }])), []);
  assert.equal(isConfiguredLocalTuitionReminderTestTarget(target), false);
});

test('allows an explicitly approved local database name and rejects staging or production environments', () => {
  const keys = [
    'ECOLETRACK_LOCAL_TUITION_REMINDER_TEST_ENABLED',
    'ECOLETRACK_LOCAL_TUITION_REMINDER_TEST_DATABASE_NAME',
    'ECOLETRACK_LOCAL_TUITION_REMINDER_TEST_TARGETS',
    'ECOLETRACK_TUITION_PROGRESS_REMINDERS_ENABLED',
    'ECOLETRACK_TUITION_PROGRESS_REMINDERS_0800_CONFIRMED',
    'NODE_ENV',
    'SQL_HOST',
    'SQL_DB_NAME',
    'INTERNAL_SECRET',
  ] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.ECOLETRACK_LOCAL_TUITION_REMINDER_TEST_ENABLED = 'true';
    process.env.ECOLETRACK_LOCAL_TUITION_REMINDER_TEST_DATABASE_NAME = 'ecoletrack';
    process.env.ECOLETRACK_LOCAL_TUITION_REMINDER_TEST_TARGETS = JSON.stringify([target]);
    process.env.ECOLETRACK_TUITION_PROGRESS_REMINDERS_ENABLED = 'false';
    process.env.ECOLETRACK_TUITION_PROGRESS_REMINDERS_0800_CONFIRMED = 'false';
    process.env.NODE_ENV = 'development';
    process.env.SQL_HOST = '127.0.0.1';
    process.env.SQL_DB_NAME = 'ecoletrack';
    process.env.INTERNAL_SECRET = 'test-secret';

    assert.equal(isLocalTuitionReminderTestEnvironment(), true);
    for (const serverAddress of [
      '127.0.0.1',
      '127.0.0.1/32',
      '::1',
      '::1/128',
      '0:0:0:0:0:0:0:1/128',
    ]) {
      assert.equal(isLocalTuitionReminderTestDatabaseIdentity({
        databaseName: 'ecoletrack',
        serverAddress,
      }), true);
    }
    for (const serverAddress of ['10.0.0.4', '127.0.0.1/24', '::2', '::1/64', null]) {
      assert.equal(isLocalTuitionReminderTestDatabaseIdentity({
        databaseName: 'ecoletrack',
        serverAddress,
      }), false);
    }
    assert.equal(isLocalTuitionReminderTestDatabaseIdentity({
      databaseName: 'another_database',
      serverAddress: '::1/128',
    }), false);
    process.env.NODE_ENV = 'production';
    assert.equal(isLocalTuitionReminderTestEnvironment(), false);
    process.env.NODE_ENV = 'development';
    process.env.SQL_HOST = 'staging-db.example';
    assert.equal(isLocalTuitionReminderTestEnvironment(), false);
    process.env.SQL_HOST = '127.0.0.1';
    process.env.SQL_DB_NAME = 'ecoletrack_staging';
    process.env.ECOLETRACK_LOCAL_TUITION_REMINDER_TEST_DATABASE_NAME = 'ecoletrack_staging';
    assert.equal(isLocalTuitionReminderTestEnvironment(), false);
    process.env.SQL_DB_NAME = 'ecoletrack_production';
    process.env.ECOLETRACK_LOCAL_TUITION_REMINDER_TEST_DATABASE_NAME = 'ecoletrack_production';
    assert.equal(isLocalTuitionReminderTestEnvironment(), false);
  } finally {
    for (const [key, value] of previous) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
