export interface TermAverageGradeRow {
  evaluationId: number;
  termId: number | null;
  subject: string;
  coefficient: number | null;
  maxScore: number | null;
  countInBulletin?: boolean | null;
  date: string;
  score: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface TermAveragePeriod {
  id: number;
  startDate: string;
  endDate: string;
}

export interface TermAverageResult {
  termAverage: number | null;
  termEvaluationCount: number;
  usedEvaluations: string[];
  ignoredEvaluations: string[];
}

export function calculateCurrentTermAverage(
  gradeRows: TermAverageGradeRow[],
  activeTerm: TermAveragePeriod | null,
): TermAverageResult {
  const usedEvaluations: string[] = [];
  const ignoredEvaluations: string[] = [];
  if (!activeTerm) {
    return { termAverage: null, termEvaluationCount: 0, usedEvaluations, ignoredEvaluations };
  }

  const gradesByEvaluation = new Map<number, TermAverageGradeRow[]>();
  for (const row of gradeRows) {
    const existing = gradesByEvaluation.get(row.evaluationId) ?? [];
    existing.push(row);
    gradesByEvaluation.set(row.evaluationId, existing);
  }

  let totalWeighted = 0;
  let totalCoefficient = 0;
  let termEvaluationCount = 0;

  for (const rows of gradesByEvaluation.values()) {
    const evaluation = rows[0];
    const evaluationDate = String(evaluation.date).slice(0, 10);
    const termMatches = evaluation.termId === activeTerm.id || (
      evaluation.termId == null
      && evaluationDate >= activeTerm.startDate
      && evaluationDate <= activeTerm.endDate
    );

    if (!termMatches) {
      ignoredEvaluations.push(`${evaluation.subject} ${evaluation.score}/${evaluation.maxScore ?? 20} -> term_id=${evaluation.termId}`);
      continue;
    }

    termEvaluationCount += 1;
    const latestGrade = [...rows].sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    })[0];

    const rawScore = latestGrade.score.trim().replace(',', '.');
    const rawValue = Number(rawScore);
    if (!Number.isFinite(rawValue)) {
      ignoredEvaluations.push(`${evaluation.subject} ${latestGrade.score} -> invalid raw score`);
      continue;
    }

    const maxScore = Number(evaluation.maxScore ?? 20);
    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      ignoredEvaluations.push(`${evaluation.subject} ${rawValue}/${evaluation.maxScore} -> invalid maxScore`);
      continue;
    }

    const coefficient = Number(evaluation.coefficient ?? 1);
    if (!Number.isFinite(coefficient) || coefficient <= 0) {
      ignoredEvaluations.push(`${evaluation.subject} ${rawValue}/${maxScore} -> invalid coefficient`);
      continue;
    }

    const normalizedScore = (rawValue / maxScore) * 20;
    totalWeighted += normalizedScore * coefficient;
    totalCoefficient += coefficient;
    usedEvaluations.push(`${evaluation.subject} ${rawValue}/${maxScore} coef ${coefficient}`);
  }

  return {
    termAverage: totalCoefficient > 0 ? Number((totalWeighted / totalCoefficient).toFixed(2)) : null,
    termEvaluationCount,
    usedEvaluations,
    ignoredEvaluations,
  };
}