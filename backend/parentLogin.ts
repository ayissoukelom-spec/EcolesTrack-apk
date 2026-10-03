export const normalizeParentLoginPhone = (value: string, phoneCountryCode?: string): string[] => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return [];
  const trimmedValue = value.trim();
  if (trimmedValue.startsWith('+')) return [digits];
  if (trimmedValue.startsWith('00')) return [digits.slice(2)];

  const countryCodeDigits = String(phoneCountryCode ?? '').replace(/\D/g, '');
  if (!countryCodeDigits) return [];
  return [`${countryCodeDigits}${digits}`];
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
  phoneCountryCode: string | undefined,
  store: MobileParentLoginStore<T>,
): Promise<T | null> => {
  const normalizedIdentifier = identifier.trim();
  if (!normalizedIdentifier) return null;

  const isEmail = normalizedIdentifier.includes('@');
  const user = isEmail
    ? await store.findParentByEmail(normalizedIdentifier.toLowerCase())
    : await store.findParentByPhone(normalizeParentLoginPhone(normalizedIdentifier, phoneCountryCode));

  if (!user || (!isEmail && user.role !== 'parent')) return null;
  return await store.verifyParentPasswordByUserId(user.id, password) ? user : null;
};