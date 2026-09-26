import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCurrentTermAverage, type TermAverageGradeRow, type TermAveragePeriod } from './termAverage.ts';

const semesterOne: TermAveragePeriod = {
  id: 6,
  startDate: '2026-09-01',
  endDate: '2026-09-22',
};

const semesterTwo: TermAveragePeriod = {
  id: 7,
  startDate: '2026-09-23',
  endDate: '2027-01-31',
};

function grade(overrides: Partial<TermAverageGradeRow> = {}): TermAverageGradeRow {
  return {
    evaluationId: 1,
    termId: semesterTwo.id,
    subject: 'Mathématiques',
    coefficient: 1,
    maxScore: 20,
    countInBulletin: true,
    date: '2026-10-01',
    score: '12',
    createdAt: '2026-10-02T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
    ...overrides,
  };
}

test('includes a graded current-term evaluation when count_in_bulletin is false', () => {
  const result = calculateCurrentTermAverage([
    grade({ evaluationId: 50, score: '12', coefficient: 3, countInBulletin: false }),
  ], semesterTwo);

  assert.equal(result.termEvaluationCount, 1);
  assert.equal(result.termAverage, 12);
});

test('computes the weighted average for multiple current-term notes', () => {
  const result = calculateCurrentTermAverage([
    grade({ evaluationId: 50, score: '12', coefficient: 3, countInBulletin: false }),
    grade({ evaluationId: 52, score: '13', coefficient: 1, countInBulletin: false }),
  ], semesterTwo);

  assert.equal(result.termAverage, 12.25);
  assert.equal(result.termEvaluationCount, 2);
});

test('includes the current semester note but excludes the previous semester note', () => {
  const result = calculateCurrentTermAverage([
    grade({ evaluationId: 1, termId: semesterOne.id, score: '20', date: '2026-09-15' }),
    grade({ evaluationId: 2, termId: semesterTwo.id, score: '10', date: '2026-09-25' }),
  ], semesterTwo);

  assert.equal(result.termAverage, 10);
  assert.equal(result.termEvaluationCount, 1);
  assert.equal(result.ignoredEvaluations.length, 1);
});

test('starts semester two with only semester two grades', () => {
  const result = calculateCurrentTermAverage([
    grade({ evaluationId: 1, termId: semesterOne.id, score: '12', coefficient: 3, date: '2026-09-15' }),
    grade({ evaluationId: 2, termId: semesterOne.id, score: '16', coefficient: 1, date: '2026-09-20' }),
    grade({ evaluationId: 3, termId: semesterTwo.id, score: '10', coefficient: 1, date: '2026-09-25' }),
  ], semesterTwo);

  assert.equal(result.termAverage, 10);
  assert.equal(result.termEvaluationCount, 1);
});

test('keeps college trimester grades isolated from semester grades', () => {
  const trimesterTwo: TermAveragePeriod = {
    id: 8,
    startDate: '2026-12-01',
    endDate: '2027-02-28',
  };
  const result = calculateCurrentTermAverage([
    grade({ evaluationId: 1, termId: semesterTwo.id, score: '18' }),
    grade({ evaluationId: 2, termId: trimesterTwo.id, score: '14', coefficient: 2 }),
  ], trimesterTwo);

  assert.equal(result.termAverage, 14);
  assert.equal(result.termEvaluationCount, 1);
});

test('returns null when the current period has no valid calculable grade', () => {
  const previousTermOnly = calculateCurrentTermAverage([
    grade({ evaluationId: 1, termId: semesterOne.id, score: '15' }),
  ], semesterTwo);
  const invalidScore = calculateCurrentTermAverage([
    grade({ evaluationId: 2, score: 'Abs' }),
  ], semesterTwo);

  assert.equal(previousTermOnly.termAverage, null);
  assert.equal(previousTermOnly.termEvaluationCount, 0);
  assert.equal(invalidScore.termAverage, null);
  assert.equal(invalidScore.termEvaluationCount, 1);
});