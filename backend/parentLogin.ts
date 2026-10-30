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
  isDeleted?: boolean;
}

export interface MobileParentLoginStore<T extends MobileParentLoginUser = MobileParentLoginUser> {
  findParentByEmail(email: string): Promise<T | null>;
  findParentByPhone(phoneCandidates: string[]): Promise<T | null>;
  verifyParentPasswordByUserId(userId: string, password: string): Promise<boolean>;
}

export const MOBILE_PARENT_ACCOUNT_DISABLED_MESSAGE = 'Ce compte est désactivé. Contactez votre administrateur.';

export class MobileParentAccountDisabledError extends Error {
  constructor() {
    super(MOBILE_PARENT_ACCOUNT_DISABLED_MESSAGE);
    this.name = 'MobileParentAccountDisabledError';
  }
}

export class MobileParentLoginRecordError extends Error {
  constructor(public readonly originalError: unknown) {
    super('Failed to record the authenticated parent login.');
    this.name = 'MobileParentLoginRecordError';
  }
}

type MobileParentLoginOutcome<T> =
  | { status: 'invalid' }
  | { status: 'disabled' }
  | { status: 'authenticated'; user: T };

const authenticateMobileParentLoginWithStatus = async <T extends MobileParentLoginUser>(
  identifier: string,
  password: string,
  phoneCountryCode: string | undefined,
  store: MobileParentLoginStore<T>,
): Promise<MobileParentLoginOutcome<T>> => {
  const normalizedIdentifier = identifier.trim();
  if (!normalizedIdentifier) return { status: 'invalid' };

  const isEmail = normalizedIdentifier.includes('@');
  const user = isEmail
    ? await store.findParentByEmail(normalizedIdentifier.toLowerCase())
    : await store.findParentByPhone(normalizeParentLoginPhone(normalizedIdentifier, phoneCountryCode));

  if (!user || (!isEmail && user.role !== 'parent')) return { status: 'invalid' };
  if (!await store.verifyParentPasswordByUserId(user.id, password)) return { status: 'invalid' };
  if (user.role === 'parent' && user.isDeleted) return { status: 'disabled' };
  return { status: 'authenticated', user };
};

export const authenticateMobileParentLogin = async <T extends MobileParentLoginUser>(
  identifier: string,
  password: string,
  phoneCountryCode: string | undefined,
  store: MobileParentLoginStore<T>,
): Promise<T | null> => {
  const outcome = await authenticateMobileParentLoginWithStatus(identifier, password, phoneCountryCode, store);
  return outcome.status === 'authenticated' ? outcome.user : null;
};

export const authenticateMobileParentLoginAndRecord = async <T extends MobileParentLoginUser>(
  identifier: string,
  password: string,
  phoneCountryCode: string | undefined,
  store: MobileParentLoginStore<T>,
  recordParentLogin: (userId: string) => Promise<number>,
): Promise<T | null> => {
  const outcome = await authenticateMobileParentLoginWithStatus(identifier, password, phoneCountryCode, store);
  if (outcome.status === 'invalid') return null;
  if (outcome.status === 'disabled') throw new MobileParentAccountDisabledError();
  const { user } = outcome;

  if (user.role === 'parent') {
    try {
      const updatedRows = await recordParentLogin(user.id);
      if (updatedRows !== 1) throw new Error('Authenticated parent row was not updated.');
    } catch (error) {
      throw new MobileParentLoginRecordError(error);
    }
  }
  return user;
};