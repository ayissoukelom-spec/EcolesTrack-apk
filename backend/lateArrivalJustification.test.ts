import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AttendanceJustificationButton } from '../src/components/AttendanceJustificationButton.js';
import {
  getAttendanceJustificationButtonColorClasses,
  getAttendanceJustificationCopy,
  getAttendanceJustificationRequest,
} from '../src/utils/attendanceJustification.js';
import { relayLateArrivalJustification } from './lateArrivalJustificationRelay.js';

const serverText = fs.readFileSync('server.ts', 'utf8');
const portalText = fs.readFileSync('src/components/ParentPortal.tsx', 'utf8');

test('mobile late-arrival justification is parent-only and allows a reason without files', () => {
  const start = serverText.indexOf('"/api/mobile/parent/late-arrivals/:id/justification"');
  const end = serverText.indexOf('// 6. GET /api/mobile/parent/children/:childId/grades', start);
  assert.ok(start >= 0 && end > start);
  const route = serverText.slice(start, end);

  assert.match(route, /requireAuth,\s*requireParentRoleOnly,\s*handleAbsenceJustificationUpload/);
  assert.match(route, /const parentId = req\.parent!\.id/);
  assert.match(route, /forwardLateArrivalJustificationToWeb/);
  assert.doesNotMatch(route, /if\s*\(!uploadedFiles\.length\)/);
  assert.match(route, /justificationReason\.length > 2000/);
});

test('mobile file download is relayed through the signed Web endpoint', () => {
  assert.match(serverText, /fetchLateArrivalJustificationFileFromWeb\(/);
  assert.match(serverText, /\/api\/internal\/late-arrival-justification-file/);
  assert.match(serverText, /X-Internal-Signature/);
  assert.match(serverText, /X-Internal-Timestamp/);
});

test('mobile relay preserves late-arrival identity and uploaded-file metadata and bytes', () => {
  const start = serverText.indexOf('async function forwardLateArrivalJustificationToWeb(');
  const end = serverText.indexOf('async function fetchLateArrivalJustificationFileFromWeb(', start);
  assert.ok(start >= 0 && end > start);
  const relay = serverText.slice(start, end);

  assert.match(relay, /lateArrivalId: String\(lateArrivalId\)/);
  assert.match(relay, /parentId: String\(parentId\)/);
  assert.match(relay, /justificationReason/);
  assert.match(relay, /fsPromises\.readFile\(file\.path\)/);
  assert.match(relay, /fileName: file\.originalname/);
  assert.match(relay, /fileMimeType: file\.mimetype/);
  assert.match(relay, /fileSha256/);
  assert.match(relay, /formData\.append\("filesMetadata"/);
  assert.match(relay, /formData\.append\("files", new Blob\(\[buffer\]/);
  assert.match(relay, /\/api\/internal\/late-arrival-justification/);
});

test('the parent register displays attendance records separately from notification alerts', () => {
  assert.match(portalText, /const attendanceRecords = useMemo/);
  assert.match(portalText, /attendanceRecords\.map\(\(abs\)/);
  assert.match(portalText, /abs\.eventType === "late"/);
  assert.match(portalText, /getAttendanceJustificationRequest\(/);
  assert.match(portalText, /formData\.append\("files", file\)/);
  assert.match(portalText, /formData\.append\("justificationReason",/);
  assert.match(portalText, /const refreshed = await fetchChildAbsences/);
  assert.match(portalText, /setJustificationConfirmation\(refreshed \? copy\.submitted/);
  assert.match(portalText, /\/api\/mobile\/parent\/late-arrivals\/\$\{record\.id\}\/justification\/files/);
});

test('late-arrival labels are specific while absence labels remain unchanged', () => {
  const lateCopy = getAttendanceJustificationCopy('late');
  const absenceCopy = getAttendanceJustificationCopy(undefined);

  assert.equal(lateCopy.buttonLabel, 'Justifier ce retard');
  assert.equal(lateCopy.dialogTitle, 'Justification du retard');
  assert.match(lateCopy.missingReason, /retard/i);
  assert.match(lateCopy.submitted, /retard/i);
  assert.equal(absenceCopy.buttonLabel, 'Justifier cette absence');
  assert.equal(absenceCopy.dialogTitle, "Justifier l'absence");
  assert.equal(absenceCopy.missingReason, 'Veuillez saisir un motif de justification.');
});

test('only the late-arrival justification button uses the orange color', () => {
  assert.equal(
    getAttendanceJustificationButtonColorClasses('late'),
    'bg-[#C65A11] hover:bg-[#A64A0D]',
  );
  assert.equal(
    getAttendanceJustificationButtonColorClasses(undefined),
    'bg-indigo-600 hover:bg-indigo-700',
  );
  assert.match(portalText, /<AttendanceJustificationButton/);
  assert.match(portalText, /text-white text-\[10px\] font-bold/);
});

test('the rendered parent buttons distinguish late arrivals from absences', () => {
  const lateButton = renderToStaticMarkup(createElement(AttendanceJustificationButton, {
    eventType: 'late',
    onClick: () => undefined,
  }));
  const absenceButton = renderToStaticMarkup(createElement(AttendanceJustificationButton, {
    eventType: 'absence',
    onClick: () => undefined,
  }));

  assert.match(lateButton, /class="[^"]*bg-\[#C65A11\][^"]*text-white/);
  assert.match(lateButton, /Justifier ce retard/);
  assert.doesNotMatch(lateButton, /bg-indigo-600/);
  assert.match(absenceButton, /class="[^"]*bg-indigo-600[^"]*text-white/);
  assert.match(absenceButton, /Justifier cette absence/);
  assert.doesNotMatch(absenceButton, /#C65A11/);
});

test('late-arrival text-only and attachment requests use the late route and multipart body', () => {
  for (const hasAttachments of [false, true]) {
    assert.deepEqual(
      getAttendanceJustificationRequest('late', '42', hasAttachments),
      {
        url: '/api/mobile/parent/late-arrivals/42/justification',
        method: 'POST',
        useMultipart: true,
      },
    );
  }
});

test('absence justification retains its existing text and attachment routes', () => {
  assert.deepEqual(getAttendanceJustificationRequest(undefined, '17', false), {
    url: '/api/absences/17/justify',
    method: 'PUT',
    useMultipart: false,
  });
  assert.deepEqual(getAttendanceJustificationRequest(undefined, '17', true), {
    url: '/api/absences/17/justifications',
    method: 'POST',
    useMultipart: true,
  });
});

test('a successful mocked Web relay is returned only after a successful HTTP response', async () => {
  const result = await relayLateArrivalJustification(
    async () => ({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ success: true, id: 42 }),
    }),
    () => assert.fail('transport error callback should not run'),
  );

  assert.equal(result.status, 201);
  assert.equal(result.successful, true);
  assert.equal(result.payload.id, 42);
});

test('a non-creation success status cannot confirm a late-arrival justification', async () => {
  const result = await relayLateArrivalJustification(
    async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true }),
    }),
    () => assert.fail('transport error callback should not run'),
  );

  assert.equal(result.status, 502);
  assert.equal(result.successful, false);
  assert.equal(result.payload.code, 'LATE_ARRIVAL_INVALID_WEB_RESPONSE');
});

test('a missing Web route returns an explicit failure and never a success-shaped response', async () => {
  const result = await relayLateArrivalJustification(
    async () => ({
      ok: false,
      status: 404,
      text: async () => '<html>Not Found</html>',
    }),
    () => assert.fail('transport error callback should not run'),
  );

  assert.equal(result.status, 404);
  assert.equal(result.successful, false);
  assert.equal(result.payload.code, 'LATE_ARRIVAL_WEB_ROUTE_UNAVAILABLE');
  assert.match(String(result.payload.error), /mise à jour coordonnée/i);
});

test('a Web authorization failure stays a failure and is specific to late arrivals', async () => {
  const result = await relayLateArrivalJustification(
    async () => ({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: 'Forbidden' }),
    }),
    () => assert.fail('transport error callback should not run'),
  );

  assert.equal(result.status, 403);
  assert.equal(result.successful, false);
  assert.equal(result.payload.code, 'LATE_ARRIVAL_JUSTIFICATION_FORBIDDEN');
  assert.match(String(result.payload.error), /retard/i);
});

test('a transport failure returns 502, logs the failure, and cannot confirm the justification', async () => {
  const offlineError = new Error('offline');
  let loggedError: unknown;
  const result = await relayLateArrivalJustification(
    async () => {
      throw offlineError;
    },
    (error) => {
      loggedError = error;
    },
  );

  assert.equal(loggedError, offlineError);
  assert.equal(result.status, 502);
  assert.equal(result.successful, false);
  assert.equal(result.payload.code, 'LATE_ARRIVAL_RELAY_UNAVAILABLE');
  assert.match(String(result.payload.error), /serveur Web/i);
});
