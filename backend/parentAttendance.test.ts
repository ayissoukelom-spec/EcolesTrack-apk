import assert from 'node:assert/strict';
import test from 'node:test';
import { getParentAttendance } from './parentAttendance.js';

test('parent attendance combines absence and late-arrival records without using notifications', async () => {
  let capturedQuery = '';
  let capturedValues: unknown[] = [];

  const attendance = await getParentAttendance(async (query, values = []) => {
    capturedQuery = query;
    capturedValues = values;
    return {
      rows: [
        {
          event_type: 'absence',
          id: 11,
          student_id: 7,
          declaration_id: null,
          date: '2026-09-24',
          period: 'morning',
          is_justified: false,
          justification_reason: null,
          justification_status: null,
          rejection_reason: null,
          subject_name: 'Mathématiques',
          start_time: '08:00',
          end_time: '09:00',
          event_reason: null,
          late_minutes: null,
          class_name: '6e A',
          justification_files: [],
        },
        {
          event_type: 'late',
          id: 19,
          student_id: 7,
          declaration_id: null,
          date: '2026-09-25',
          period: 'morning',
          is_justified: false,
          justification_reason: 'Incident de transport',
          justification_status: 'PENDING',
          rejection_reason: null,
          subject_name: 'Français',
          start_time: '08:00',
          end_time: '08:17',
          event_reason: 'Bus en retard',
          late_minutes: 17,
          class_name: '6e A',
          justification_files: [{
            id: 31,
            fileName: 'billet.pdf',
            mimeType: 'application/pdf',
            fileSize: 2048,
          }],
        },
      ],
    };
  }, '7');

  assert.deepEqual(capturedValues, [7]);
  assert.match(capturedQuery, /FROM late_arrivals la/);
  assert.match(capturedQuery, /late_arrival_justification_files/);
  assert.doesNotMatch(capturedQuery, /FROM notifications/i);
  assert.equal(attendance.length, 2);
  assert.equal(attendance[0].eventType, 'absence');
  assert.equal(attendance[0].reason, 'Absence non justifiée');
  assert.equal(attendance[1].eventType, 'late');
  assert.equal(attendance[1].reason, 'Bus en retard');
  assert.equal(attendance[1].justificationStatus, 'PENDING');
  assert.equal(attendance[1].lateMinutes, 17);
  assert.deepEqual(attendance[1].justificationFiles, [{
    id: '31',
    fileName: 'billet.pdf',
    mimeType: 'application/pdf',
    fileSize: 2048,
  }]);
});

test('late arrivals without a submitted justification remain eligible for parent action', async () => {
  const [lateArrival] = await getParentAttendance(async () => ({
    rows: [{
      event_type: 'late',
      id: 20,
      student_id: 7,
      declaration_id: null,
      date: '2026-09-26',
      period: 'afternoon',
      is_justified: false,
      justification_reason: null,
      justification_status: null,
      rejection_reason: null,
      subject_name: null,
      start_time: '14:00',
      end_time: '14:08',
      event_reason: null,
      late_minutes: 8,
      class_name: '6e A',
      justification_files: '[]',
    }],
  }), '7');

  assert.equal(lateArrival.eventType, 'late');
  assert.equal(lateArrival.reason, 'Retard enregistré');
  assert.equal(lateArrival.justificationStatus, null);
  assert.deepEqual(lateArrival.justificationFiles, []);
});
