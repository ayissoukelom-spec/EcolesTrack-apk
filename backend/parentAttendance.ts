import type { Absence, JustificationFile } from '../src/types.js';
import { mapParentAbsenceRow } from './absenceJustification.js';

interface ParentAttendanceRow {
  event_type: 'absence' | 'late';
  id: number | string;
  student_id: number | string;
  declaration_id: number | string | null;
  date: string;
  period: string | null;
  is_justified: boolean;
  justification_reason: string | null;
  justification_status: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  rejection_reason: string | null;
  subject_name: string | null;
  start_time: string | null;
  end_time: string | null;
  event_reason: string | null;
  late_minutes: number | null;
  class_name: string | null;
  justification_files: Array<{
    id: number | string;
    fileName: string;
    mimeType: string;
    fileSize: number | string;
  }> | string | null;
}

type ParentAttendanceQuery = (
  query: string,
  values?: unknown[],
) => Promise<{ rows: ParentAttendanceRow[] }>;

const PARENT_ATTENDANCE_QUERY = `
  SELECT
    'absence'::text AS event_type,
    a.id,
    a.student_id,
    a.declaration_id,
    a.date,
    a.period,
    a.is_justified,
    a.justification_reason,
    a.justification_status,
    a.rejection_reason,
    s.name AS subject_name,
    a.start_time,
    a.end_time,
    NULL::text AS event_reason,
    NULL::integer AS late_minutes,
    c.name AS class_name,
    '[]'::jsonb AS justification_files
  FROM absences a
  LEFT JOIN subjects s ON s.id = a.subject_id
  LEFT JOIN students st ON st.id = a.student_id
  LEFT JOIN classes c ON c.id = st.class_id
  WHERE a.student_id = $1

  UNION ALL

  SELECT
    'late'::text AS event_type,
    la.id,
    la.student_id,
    NULL::integer AS declaration_id,
    la.date,
    la.period,
    COALESCE(j.status = 'APPROVED', false) AS is_justified,
    j.justification_reason,
    j.status AS justification_status,
    j.rejection_reason,
    subject.name AS subject_name,
    la.expected_start_time AS start_time,
    la.arrival_time AS end_time,
    la.reason AS event_reason,
    la.late_minutes,
    c.name AS class_name,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id,
        'fileName', f.file_name,
        'mimeType', f.mime_type,
        'fileSize', f.file_size
      ) ORDER BY f.id)
      FROM late_arrival_justification_files f
      WHERE f.justification_id = j.id
    ), '[]'::jsonb) AS justification_files
  FROM late_arrivals la
  LEFT JOIN late_arrival_justifications j ON j.late_arrival_id = la.id
  LEFT JOIN teacher_class_subjects assignment ON assignment.id = la.teaching_assignment_id
  LEFT JOIN subjects subject ON subject.id = assignment.subject_id
  LEFT JOIN classes c ON c.id = la.class_id
  WHERE la.student_id = $1
`;

const mapJustificationFiles = (
  files: ParentAttendanceRow['justification_files'],
): JustificationFile[] => {
  const parsed = typeof files === 'string' ? JSON.parse(files) : files;
  if (!Array.isArray(parsed)) return [];
  return parsed.map((file) => ({
    id: String(file.id),
    fileName: file.fileName,
    mimeType: file.mimeType,
    fileSize: Number(file.fileSize),
  }));
};

export const getParentAttendance = async (
  query: ParentAttendanceQuery,
  childId: string,
): Promise<Absence[]> => {
  const numericChildId = Number(childId);
  if (!Number.isInteger(numericChildId)) return [];

  const { rows } = await query(PARENT_ATTENDANCE_QUERY, [numericChildId]);
  return rows.map((row) => {
    const mapped = mapParentAbsenceRow(row, childId);
    if (row.event_type === 'absence') {
      return {
        ...mapped,
        eventType: 'absence',
        className: row.class_name ?? undefined,
      };
    }

    return {
      ...mapped,
      eventType: 'late',
      reason: row.event_reason || 'Retard enregistré',
      className: row.class_name ?? undefined,
      lateMinutes: row.late_minutes == null ? undefined : Number(row.late_minutes),
      justificationFiles: mapJustificationFiles(row.justification_files),
    };
  });
};
