import type { Absence } from '../src/types.js';

interface AbsenceRow {
  id: number | string;
  student_id?: number | string;
  date: string;
  period?: string | null;
  is_justified: boolean;
  justification_reason: string | null;
  justification_status?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  rejection_reason?: string | null;
  subject_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}

type AbsenceQuery = (query: string, values?: unknown[]) => Promise<{ rows: AbsenceRow[] }>;

export const JUSTIFICATION_ALREADY_REJECTED_CODE = 'JUSTIFICATION_ALREADY_REJECTED';
export const JUSTIFICATION_ALREADY_REJECTED_MESSAGE = 'Cette justification a déjà été rejetée. Veuillez vous rapprocher de l’établissement avec les justificatifs nécessaires.';

export class AbsenceJustificationAlreadyRejectedError extends Error {
  readonly code = JUSTIFICATION_ALREADY_REJECTED_CODE;

  constructor() {
    super(JUSTIFICATION_ALREADY_REJECTED_MESSAGE);
    this.name = 'AbsenceJustificationAlreadyRejectedError';
  }
}

export const mapParentAbsenceRow = (row: AbsenceRow, childId: string): Absence => ({
  id: String(row.id),
  childId: String(row.student_id ?? childId),
  date: row.date,
  reason: row.is_justified ? 'Absence justifiée' : 'Absence non justifiée',
  justified: row.is_justified,
  justificationText: row.justification_reason ?? undefined,
  justificationStatus: row.justification_status ?? null,
  rejectionReason: row.rejection_reason ?? undefined,
  subjectName: row.subject_name ?? undefined,
  startTime: row.start_time ?? undefined,
  endTime: row.end_time ?? undefined,
  period: row.period ?? undefined,
});

export const submitAbsenceJustificationForReview = async (
  query: AbsenceQuery,
  absenceId: string,
  parentId: string,
  justificationReason: string,
): Promise<Absence | null> => {
  const { rows } = await query(`
    UPDATE absences AS a
    SET is_justified = false,
        justification_reason = $1,
        justification_status = 'PENDING',
        rejection_reason = NULL,
        reviewed_by = NULL,
        reviewed_at = NULL
    FROM students AS s
    JOIN parents AS p ON p.id = s.parent_id
    WHERE a.id = $2
      AND a.student_id = s.id
      AND p.user_id = $3
      AND a.justification_status IS DISTINCT FROM 'REJECTED'
    RETURNING a.id, a.student_id, a.date, a.is_justified,
      a.justification_reason, a.justification_status, a.rejection_reason
  `, [justificationReason, absenceId, parentId]);

  if (rows.length === 0) {
    const existing = await query(`
      SELECT a.justification_status
      FROM absences AS a
      JOIN students AS s ON s.id = a.student_id
      JOIN parents AS p ON p.id = s.parent_id
      WHERE a.id = $1 AND p.user_id = $2
    `, [absenceId, parentId]);
    if (existing.rows[0]?.justification_status === 'REJECTED') {
      throw new AbsenceJustificationAlreadyRejectedError();
    }
    return null;
  }
  return mapParentAbsenceRow(rows[0], rows[0].student_id == null ? '' : String(rows[0].student_id));
};