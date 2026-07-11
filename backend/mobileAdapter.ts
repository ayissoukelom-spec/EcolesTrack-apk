export interface MobileParentProfile {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  activeSchoolId: string;
  schools: Array<{ id: string; name: string }>;
  role: string;
}

export interface MobileChild {
  id: string;
  parentId: string;
  firstName: string;
  lastName: string;
  className: string;
  birthDate: string;
  avatarUrl: string;
}

export interface WebParentRow {
  userId: number;
  userEmail: string;
  userName: string;
  userPhone?: string | null;
  activeSchoolId?: number | null;
  schoolMemberships?: Array<{ id: number; name: string }>;
  role: string;
}

export interface WebStudentRow {
  id: number;
  firstName: string;
  lastName: string;
  birthDate?: string | null;
  schoolId?: number | null;
  classId?: number | null;
  className?: string | null;
  parentId?: number | null;
}

export function mapWebParentToMobileParent(row: WebParentRow): MobileParentProfile {
  return {
    id: String(row.userId),
    name: row.userName,
    email: row.userEmail,
    phoneNumber: row.userPhone ?? '',
    activeSchoolId: row.activeSchoolId != null ? String(row.activeSchoolId) : '',
    schools: (row.schoolMemberships ?? []).map((school) => ({
      id: String(school.id),
      name: school.name,
    })),
    role: row.role,
  };
}

export function mapWebStudentToChild(row: WebStudentRow): MobileChild {
  return {
    id: String(row.id),
    parentId: row.parentId != null ? String(row.parentId) : '',
    firstName: row.firstName,
    lastName: row.lastName,
    className: row.className ?? '',
    birthDate: row.birthDate ?? '',
    avatarUrl: '',
  };
}
