import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MOBILE_VISIT_RESUME_THRESHOLD_MS,
  MobileVisitTracker,
} from './mobileVisit.js';

test('records one visit when an authenticated app session opens', async () => {
  const tracker = new MobileVisitTracker();
  const recordVisit = async () => { calls += 1; };
  let calls = 0;
  tracker.setAuthenticatedParent('parent-1');

  assert.equal(await tracker.recordAppOpen('parent-1', recordVisit), true);
  assert.equal(await tracker.recordAppOpen('parent-1', recordVisit), false);
  assert.equal(calls, 1);
});

test('does not record a foreground return before five minutes', async () => {
  const tracker = new MobileVisitTracker();
  let calls = 0;
  tracker.setAuthenticatedParent('parent-1');
  tracker.markBackgrounded('parent-1', 1000);

  assert.equal(await tracker.recordForegroundReturn(
    'parent-1',
    async () => { calls += 1; },
    1000 + MOBILE_VISIT_RESUME_THRESHOLD_MS - 1,
  ), false);
  assert.equal(calls, 0);
});

test('records only once for repeated foreground events after five minutes', async () => {
  const tracker = new MobileVisitTracker();
  let calls = 0;
  tracker.setAuthenticatedParent('parent-1');
  tracker.markBackgrounded('parent-1', 1000);

  assert.equal(await tracker.recordForegroundReturn(
    'parent-1',
    async () => { calls += 1; },
    1000 + MOBILE_VISIT_RESUME_THRESHOLD_MS,
  ), true);
  assert.equal(await tracker.recordForegroundReturn(
    'parent-1',
    async () => { calls += 1; },
    1000 + MOBILE_VISIT_RESUME_THRESHOLD_MS + 1,
  ), false);
  assert.equal(calls, 1);
});

test('coalesces Android and browser lifecycle events for one background return', async () => {
  const tracker = new MobileVisitTracker();
  let calls = 0;
  tracker.setAuthenticatedParent('parent-1');

  tracker.markBackgrounded('parent-1', 1000);
  tracker.markBackgrounded('parent-1', 1500);
  const resumeViaAndroid = tracker.recordForegroundReturn(
    'parent-1',
    async () => { calls += 1; },
    1000 + MOBILE_VISIT_RESUME_THRESHOLD_MS,
  );
  const resumeViaVisibilityChange = tracker.recordForegroundReturn(
    'parent-1',
    async () => { calls += 1; },
    1000 + MOBILE_VISIT_RESUME_THRESHOLD_MS,
  );
  const resumeViaFocus = tracker.recordForegroundReturn(
    'parent-1',
    async () => { calls += 1; },
    1000 + MOBILE_VISIT_RESUME_THRESHOLD_MS,
  );

  assert.deepEqual(await Promise.all([
    resumeViaAndroid,
    resumeViaVisibilityChange,
    resumeViaFocus,
  ]), [true, false, false]);
  assert.equal(calls, 1);
});

test('coalesces overlapping open and foreground visit requests', async () => {
  const tracker = new MobileVisitTracker();
  let calls = 0;
  let resolveVisit!: () => void;
  const recordVisit = () => {
    calls += 1;
    return new Promise<void>((resolve) => { resolveVisit = resolve; });
  };
  tracker.setAuthenticatedParent('parent-1');
  const opening = tracker.recordAppOpen('parent-1', recordVisit);
  const duplicate = tracker.recordAppOpen('parent-1', recordVisit);

  assert.equal(calls, 1);
  resolveVisit();
  assert.deepEqual(await Promise.all([opening, duplicate]), [true, true]);
});

test('does not record visits for a different or unauthenticated parent', async () => {
  const tracker = new MobileVisitTracker();
  let calls = 0;
  tracker.setAuthenticatedParent('parent-1');

  assert.equal(await tracker.recordAppOpen('parent-2', async () => { calls += 1; }), false);
  assert.equal(await tracker.recordAppOpen('', async () => { calls += 1; }), false);
  assert.equal(calls, 0);
});
