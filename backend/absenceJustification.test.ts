import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AbsenceJustificationAlreadyRejectedError,
  JUSTIFICATION_ALREADY_REJECTED_CODE,
  mapParentAbsenceRow,
  submitAbsenceJustificationForReview,
} from './absenceJustification.js';

test('text-only parent justification is stored pending and is not auto-approved', async () => {
  let capturedQuery = '';
  let capturedValues: unknown[] = [];

  const absence = await submitAbsenceJustificationForReview(async (query, values = []) => {
    capturedQuery = query;
    capturedValues = values;
    return {
      rows: [{
        id: 45,
        student_id: 12,
        date: '2026-09-26',
        is_justified: false,
        justification_reason: 'Maladie',
        justification_status: 'PENDING',
        rejection_reason: null,
      }],
    };
  }, '45', '7', 'Maladie');

  assert.match(capturedQuery, /is_justified\s*=\s*false/);
  assert.match(capturedQuery, /justification_status\s*=\s*'PENDING'/);
  assert.match(capturedQuery, /rejection_reason\s*=\s*NULL/);
  assert.match(capturedQuery, /reviewed_by\s*=\s*NULL/);
  assert.deepEqual(capturedValues, ['Maladie', '45', '7']);
  assert.equal(absence?.justified, false);
  assert.equal(absence?.justificationStatus, 'PENDING');
  assert.equal(absence?.justificationText, 'Maladie');
});

test('parent text justification returns null when the absence is not owned by that parent', async () => {
  const absence = await submitAbsenceJustificationForReview(async () => ({ rows: [] }), '45', '99', 'Maladie');

  assert.equal(absence, null);
});

test('a rejected justification cannot be resubmitted by its parent', async () => {
  let queryCount = 0;
  await assert.rejects(
    submitAbsenceJustificationForReview(async (query) => {
      queryCount += 1;
      if (queryCount === 1) {
        assert.match(query, /justification_status IS DISTINCT FROM 'REJECTED'/);
        return { rows: [] };
      }
      return { rows: [{ justification_status: 'REJECTED' }] } as any;
    }, '45', '7', 'Nouvelle tentative'),
    (error: unknown) => error instanceof AbsenceJustificationAlreadyRejectedError
      && error.code === JUSTIFICATION_ALREADY_REJECTED_CODE
      && error.message.includes('rapprocher de l’établissement'),
  );
  assert.equal(queryCount, 2);
});

test('parent absence response preserves pending review status and rejection reason', () => {
  const absence = mapParentAbsenceRow({
    id: 45,
    student_id: 12,
    date: '2026-09-26',
    is_justified: false,
    justification_reason: 'Maladie',
    justification_status: 'PENDING',
    rejection_reason: null,
  }, '12');

  assert.equal(absence.justified, false);
  assert.equal(absence.justificationStatus, 'PENDING');
  assert.equal(absence.justificationText, 'Maladie');
});