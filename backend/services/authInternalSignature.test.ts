import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

process.env.JWT_SECRET = 'test-jwt-secret-for-internal-signature-unit-tests';
const { AuthService } = await import('./auth');

test('internal HMAC validates the exact body, rejects stale or malformed timestamps, and never logs signatures', () => {
  const previousSecret = process.env.INTERNAL_SECRET;
  const internalSecret = 'test-internal-secret-for-signature-tests';
  process.env.INTERNAL_SECRET = internalSecret;
  const body = JSON.stringify({ parentId: '91', controlId: 101 });
  const timestamp = Date.now().toString();
  const signature = createHmac('sha256', internalSecret)
    .update(`${body}${timestamp}`)
    .digest('hex');
  const logLines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logLines.push(args.map(String).join(' '));

  try {
    assert.equal(AuthService.verifyInternalSignature(body, signature, timestamp), true);
    assert.equal(AuthService.verifyInternalSignature(`${body} `, signature, timestamp), false);

    const staleTimestamp = String(Date.now() - 6 * 60 * 1000);
    const staleSignature = createHmac('sha256', internalSecret)
      .update(`${body}${staleTimestamp}`)
      .digest('hex');
    assert.equal(AuthService.verifyInternalSignature(body, staleSignature, staleTimestamp), false);
    assert.equal(AuthService.verifyInternalSignature(body, signature, `${timestamp}junk`), false);
    assert.equal(logLines.some((line) => line.includes(signature)), false);
    assert.equal(logLines.some((line) => line.includes(internalSecret)), false);
  } finally {
    console.log = originalLog;
    if (previousSecret === undefined) delete process.env.INTERNAL_SECRET;
    else process.env.INTERNAL_SECRET = previousSecret;
  }
});
