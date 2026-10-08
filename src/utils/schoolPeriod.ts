import type { SchoolPeriodType } from '../types';

export const SCHOOL_PERIOD_FALLBACK_LABEL = 'Période scolaire non configurée';

export function getExpectedPeriodTypeForCycle(cycleCode: string | null | undefined): SchoolPeriodType | null {
  if (cycleCode === 'college') return 'trimester';
  if (cycleCode === 'lycee') return 'semester';
  return null;
}

export function getSchoolPeriodLabel(cycleCode: string | null | undefined, periodType: string | null | undefined): string {
  const expectedPeriodType = getExpectedPeriodTypeForCycle(cycleCode);
  if (!expectedPeriodType || periodType !== expectedPeriodType) return SCHOOL_PERIOD_FALLBACK_LABEL;
  return periodType === 'semester' ? 'Note du semestre' : 'Note du trimestre';
}

export function isGradeInSchoolPeriod(
  grade: { termId?: string | null; date: string },
  period: { id: string; startDate: string; endDate: string } | null | undefined,
): boolean {
  if (!period) return false;
  const gradeDate = grade.date.slice(0, 10);
  return Boolean(period.startDate && period.endDate && gradeDate >= period.startDate && gradeDate <= period.endDate);
}