import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AbsenceDeclarationRelayError, relayAbsenceDeclaration } from './absenceDeclarations.js';
import { ParentAbsenceDeclarationSchema } from './validators/schemas.js';

test('validates calendar dates without JavaScript date normalization', () => {
  const parse = (date: string) => ParentAbsenceDeclarationSchema.safeParse({
    childId: '1',
    date,
    startTime: '08:00',
    endTime: '10:00',
    reason: 'Maladie',
  }).success;

  assert.equal(parse('2026-02-31'), false);
  assert.equal(parse('2026-02-29'), false);
  assert.equal(parse('2026-04-31'), false);
  assert.equal(parse('2026-02-28'), true);
  assert.equal(parse('2024-02-29'), true);
});

test('requires a trimmed nonblank mobile declaration reason and retains its length limit', () => {
  const base = {
    childId: '1',
    date: '2026-09-30',
    startTime: '08:00',
    endTime: '10:00',
  };
  const invalidPayloads = [
    base,
    { ...base, reason: undefined },
    { ...base, reason: null },
    { ...base, reason: '' },
    { ...base, reason: '   ' },
  ];

  for (const payload of invalidPayloads) {
    assert.equal(ParentAbsenceDeclarationSchema.safeParse(payload).success, false);
  }

  const valid = ParentAbsenceDeclarationSchema.safeParse({ ...base, reason: '  Maladie  ' });
  assert.equal(valid.success, true);
  if (valid.success) assert.equal(valid.data.reason, 'Maladie');
  assert.equal(ParentAbsenceDeclarationSchema.safeParse({ ...base, reason: 'x'.repeat(1001) }).success, false);
});

test('mobile parent declaration UI requires and blocks a blank reason', () => {
  const parentPortal = readFileSync(new URL('../src/components/ParentPortal.tsx', import.meta.url), 'utf8');
  assert.match(parentPortal, /Motif\s*<input required value=\{absenceDeclarationReason\}/);
  assert.match(parentPortal, /if \(!reason\)/);
  assert.match(parentPortal, /Veuillez saisir un motif de déclaration\./);
  assert.doesNotMatch(parentPortal, /Motif \(facultatif\)/);
});

test('mobile create and update routes validate the payload before relaying it', () => {
  const mobileServer = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const routeDeclarations = [
    'app.post("/api/mobile/parent/absence-declarations"',
    'app.put("/api/mobile/parent/absence-declarations/:id"',
  ];

  for (const routeDeclaration of routeDeclarations) {
    const routeStart = mobileServer.indexOf(routeDeclaration);
    assert.notEqual(routeStart, -1, `missing route: ${routeDeclaration}`);
    const routeEnd = mobileServer.indexOf('\n});', routeStart);
    const routeBody = mobileServer.slice(routeStart, routeEnd);
    const validationIndex = routeBody.indexOf('ParentAbsenceDeclarationSchema.safeParse(req.body)');
    const relayIndex = routeBody.indexOf('relayAbsenceDeclaration(');
    assert.ok(validationIndex >= 0 && relayIndex > validationIndex, `${routeDeclaration} must validate before relay`);
  }
});

test('relays parent declaration operations to the Web API with a signed payload', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const response = await relayAbsenceDeclaration(
    'https://web.example///',
    'internal-secret',
    '42',
    'create',
    { studentId: 15, date: '2026-09-30', startTime: '08:00', endTime: '10:00' },
    async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({ id: 7, status: 'RECEIVED' }), { status: 201 });
    },
  );

  assert.equal(capturedUrl, 'https://web.example/api/internal/absence-declarations');
  assert.equal(response.status, 201);
  assert.equal(response.body.status, 'RECEIVED');
  const payload = JSON.parse(String(capturedInit?.body));
  assert.equal(payload.parentUserId, '42');
  assert.equal(payload.action, 'create');
  assert.equal(payload.input.studentId, 15);
  const timestamp = new Headers(capturedInit?.headers).get('X-Internal-Timestamp');
  const signature = new Headers(capturedInit?.headers).get('X-Internal-Signature');
  const expected = crypto.createHmac('sha256', 'internal-secret').update(`${JSON.stringify(payload)}${timestamp}`).digest('hex');
  assert.equal(signature, expected);
});

test('preserves Web authorization errors instead of applying local fallback logic', async () => {
  await assert.rejects(
    relayAbsenceDeclaration('https://web.example', 'internal-secret', '42', 'cancel', { id: 8 }, async () => (
      new Response(JSON.stringify({ error: 'Declaration belongs to another parent' }), { status: 403 })
    )),
    (error: unknown) => error instanceof AbsenceDeclarationRelayError
      && error.status === 403
      && error.message === 'Declaration belongs to another parent',
  );
});