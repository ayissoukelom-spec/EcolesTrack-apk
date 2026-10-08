import test from 'node:test';
import assert from 'node:assert/strict';
import { getSchoolPeriodLabel, isGradeInSchoolPeriod, SCHOOL_PERIOD_FALLBACK_LABEL } from './schoolPeriod.ts';

test('uses the configured cycle and period for the parent dashboard label', () => {
  assert.equal(getSchoolPeriodLabel('college', 'trimester'), 'Note du trimestre');
  assert.equal(getSchoolPeriodLabel('lycee', 'semester'), 'Note du semestre');
});

test('uses an explicit safe label when cycle or period is missing or inconsistent', () => {
  assert.equal(getSchoolPeriodLabel(null, 'semester'), SCHOOL_PERIOD_FALLBACK_LABEL);
  assert.equal(getSchoolPeriodLabel('college', null), SCHOOL_PERIOD_FALLBACK_LABEL);
  assert.equal(getSchoolPeriodLabel('lycee', 'trimester'), SCHOOL_PERIOD_FALLBACK_LABEL);
});

test('matches grades by the current configured period dates regardless of saved term id', () => {
  const period = { id: '24', startDate: '2026-01-01', endDate: '2026-03-31' };

  assert.equal(isGradeInSchoolPeriod({ termId: '24', date: '2025-09-15' }, period), false);
  assert.equal(isGradeInSchoolPeriod({ termId: '23', date: '2026-02-01' }, period), true);
  assert.equal(isGradeInSchoolPeriod({ termId: null, date: '2026-02-01' }, period), true);
  assert.equal(isGradeInSchoolPeriod({ termId: null, date: '2025-09-15' }, period), false);
  assert.equal(isGradeInSchoolPeriod({ date: '2026-02-01' }, null), false);
});