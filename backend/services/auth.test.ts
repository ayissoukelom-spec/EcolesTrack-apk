import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { AuthService } from './auth';
import { dbQuery } from '../postgres';

function isPromise(value: any): boolean {
  return value && typeof value.then === 'function';
}

test('AuthService creates a session and persists refresh token', async () => {
  const parentId = 'test-parent-1';
  const session = await AuthService.createSession(parentId, 'parent');

  assert.equal(typeof session.accessToken, 'string');
  assert.equal(typeof session.refreshToken, 'string');
  assert.ok(session.refreshToken.length > 0);

  const refreshTokenHash = crypto.createHash('sha256').update(session.refreshToken).digest('hex');
  const { rows } = await dbQuery<{ id: number; parent_id: string; is_active: boolean }>(
    `SELECT id, parent_id, is_active FROM mobile_parent_sessions WHERE refresh_token_hash = $1 LIMIT 1`,
    [refreshTokenHash]
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].parent_id, parentId);
  assert.equal(rows[0].is_active, true);
});

test('AuthService rotates refresh token and invalidates old one', async () => {
  const parentId = 'test-parent-2';
  const sessionA = await AuthService.createSession(parentId, 'parent');
  const sessionB = await AuthService.rotateSession(sessionA.refreshToken);

  assert.ok(sessionB, 'Expected refresh rotation to succeed');
  assert.notEqual(sessionA.refreshToken, sessionB!.refreshToken, 'New refresh token must differ from old one');

  const oldHash = require('crypto').createHash('sha256').update(sessionA.refreshToken).digest('hex');
  const { rows: oldRows } = await dbQuery<{ is_active: boolean }>(
    `SELECT is_active FROM mobile_parent_sessions WHERE refresh_token_hash = $1 LIMIT 1`,
    [oldHash]
  );
  assert.equal(oldRows.length, 1);
  assert.equal(oldRows[0].is_active, false, 'Old refresh token must be deactivated after rotation');
});

test('AuthService rejects old refresh token after rotation', async () => {
  const parentId = 'test-parent-3';
  const sessionA = await AuthService.createSession(parentId, 'parent');
  const sessionB = await AuthService.rotateSession(sessionA.refreshToken);

  assert.ok(sessionB, 'First refresh should succeed');
  const sessionC = await AuthService.rotateSession(sessionA.refreshToken);

  assert.equal(sessionC, null, 'Old refresh token should no longer be valid after rotation');
});

test('AuthService logout invalidates the specified refresh token', async () => {
  const parentId = 'test-parent-4';
  const session = await AuthService.createSession(parentId, 'parent');

  await AuthService.revokeSession(parentId, session.refreshToken);
  const refreshTokenHash = require('crypto').createHash('sha256').update(session.refreshToken).digest('hex');
  const { rows } = await dbQuery<{ is_active: boolean }>(
    `SELECT is_active FROM mobile_parent_sessions WHERE refresh_token_hash = $1 LIMIT 1`,
    [refreshTokenHash]
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].is_active, false);
});

test('AuthService reuses login response format and is async', async () => {
  const parentId = 'test-parent-5';
  const createSessionResult = AuthService.createSession(parentId, 'parent');
  assert.equal(isPromise(createSessionResult), true, 'createSession should return a promise after persistence change');

  const session = await createSessionResult;
  assert.equal(typeof session.accessToken, 'string');
  assert.equal(typeof session.refreshToken, 'string');
});
