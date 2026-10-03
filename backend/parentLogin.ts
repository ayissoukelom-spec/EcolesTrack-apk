export const normalizeParentLoginPhone = (value: string): string[] => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return [];
  if (/^\d{8}$/.test(digits)) return [digits, `228${digits}`];
  if (/^228\d{8}$/.test(digits)) return [digits, digits.slice(3)];
  return [digits];
};

export const selectUniqueParentPhoneMatch = <T extends { user_id: number | string }>(rows: T[]): T | null => {
  const uniqueRows = new Map(rows.map((row) => [String(row.user_id), row]));
  return uniqueRows.size === 1 ? uniqueRows.values().next().value ?? null : null;
};

export interface MobileParentLoginUser {
  id: string;
  role: string;
}

export interface MobileParentLoginStore<T extends MobileParentLoginUser = MobileParentLoginUser> {
  findParentByEmail(email: string): Promise<T | null>;
  findParentByPhone(phoneCandidates: string[]): Promise<T | null>;
  verifyParentPasswordByUserId(userId: string, password: string): Promise<boolean>;
}

export const authenticateMobileParentLogin = async <T extends MobileParentLoginUser>(
  identifier: string,
  password: string,
  store: MobileParentLoginStore<T>,
): Promise<T | null> => {
  const normalizedIdentifier = identifier.trim();
  if (!normalizedIdentifier) return null;

  const isEmail = normalizedIdentifier.includes('@');
  const user = isEmail
    ? await store.findParentByEmail(normalizedIdentifier.toLowerCase())
    : await store.findParentByPhone(normalizeParentLoginPhone(normalizedIdentifier));

  if (!user || (!isEmail && user.role !== 'parent')) return null;
  return await store.verifyParentPasswordByUserId(user.id, password) ? user : null;
};