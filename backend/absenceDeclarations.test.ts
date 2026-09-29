import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { AbsenceDeclarationRelayError, relayAbsenceDeclaration } from './absenceDeclarations.js';
import { ParentAbsenceDeclarationSchema } from './validators/schemas.js';

test('validates calendar dates without JavaScript date normalization', () => {
  const parse = (date: string) => ParentAbsenceDeclarationSchema.safeParse({
    childId: '1',
    date,
    startTime: '08:00',
    endTime: '10:00',
  }).success;

  assert.equal(parse('2026-02-31'), false);
  assert.equal(parse('2026-02-29'), false);
  assert.equal(parse('2026-04-31'), false);
  assert.equal(parse('2026-02-28'), true);
  assert.equal(parse('2024-02-29'), true);
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