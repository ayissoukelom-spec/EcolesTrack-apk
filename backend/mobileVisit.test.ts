import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MobileVisitRateLimiter,
  MobileParentVisitAuthorizationError,
  recordAuthenticatedMobileParentVisit,
} from './mobileVisit.js';

test('rejects missing and non-parent authenticated contexts', async () => {
  await assert.rejects(
    recordAuthenticatedMobileParentVisit(undefined, async () => 'recorded'),
    MobileParentVisitAuthorizationError,
  );
  await assert.rejects(
    recordAuthenticatedMobileParentVisit({ id: 'teacher-1', role: 'teacher' }, async () => 'recorded'),
    MobileParentVisitAuthorizationError,
  );
});

test('uses only the authenticated parent id when persisting a visit', async () => {
  const ids: string[] = [];
  const recorded = await recordAuthenticatedMobileParentVisit(
    { id: 'authenticated-parent', role: 'parent' },
    async (parentId) => {
      ids.push(parentId);
      return 'recorded';
    },
  );

  assert.equal(recorded, 'recorded');
  assert.deepEqual(ids, ['authenticated-parent']);
});

test('distinguishes coalesced visits, missing parents, and invalid database roles', async () => {
  const parent = { id: 'parent-1', role: 'parent' };
  assert.equal(await recordAuthenticatedMobileParentVisit(parent, async () => 'coalesced'), 'coalesced');
  assert.equal(await recordAuthenticatedMobileParentVisit(parent, async () => 'parent_not_found'), 'parent_not_found');
  const recorded = await recordAuthenticatedMobileParentVisit(
    parent,
    async () => 'parent_role_invalid',
  );
  assert.equal(recorded, 'parent_role_invalid');
});

test('propagates persistence errors and rejects unexpected outcomes', async () => {
  await assert.rejects(
    recordAuthenticatedMobileParentVisit(
      { id: 'parent-1', role: 'parent' },
      async () => { throw new Error('database unavailable'); },
    ),
    /database unavailable/,
  );
  await assert.rejects(
    recordAuthenticatedMobileParentVisit(
      { id: 'parent-1', role: 'parent' },
      async () => 'unexpected' as never,
    ),
    /Unexpected mobile parent visit outcome/,
  );
});

test('limits visits by authenticated parent rather than forwarded IP headers', () => {
  const limiter = new MobileVisitRateLimiter(2, 60_000);
  assert.deepEqual(limiter.consume('parent-1', 1000), { allowed: true, resetInSeconds: 0 });
  assert.deepEqual(limiter.consume('parent-1', 2000), { allowed: true, resetInSeconds: 0 });
  assert.deepEqual(limiter.consume('parent-1', 3000), { allowed: false, resetInSeconds: 58 });
  assert.deepEqual(limiter.consume('parent-2', 3000), { allowed: true, resetInSeconds: 0 });
  assert.deepEqual(limiter.consume('parent-1', 61_001), { allowed: true, resetInSeconds: 0 });
});
