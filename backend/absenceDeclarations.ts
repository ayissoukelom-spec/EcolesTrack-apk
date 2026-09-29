import crypto from 'node:crypto';

export type AbsenceDeclarationAction = 'list' | 'create' | 'update' | 'cancel';

export class AbsenceDeclarationRelayError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AbsenceDeclarationRelayError';
    this.status = status;
  }
}

export async function relayAbsenceDeclaration(
  webBackendUrl: string,
  internalSecret: string,
  parentUserId: string,
  action: AbsenceDeclarationAction,
  input: Record<string, unknown> = {},
  fetcher: typeof fetch = fetch,
) {
  const baseUrl = webBackendUrl.trim().replace(/\/+$/, '');
  if (!baseUrl || !internalSecret.trim()) {
    throw new AbsenceDeclarationRelayError('Le serveur Web des déclarations est indisponible.', 502);
  }

  const payload = { parentUserId, action, input };
  const timestamp = Date.now().toString();
  const hmac = crypto.createHmac('sha256', internalSecret);
  hmac.update(`${JSON.stringify(payload)}${timestamp}`);
  const signature = hmac.digest('hex');
  let response: Response;
  try {
    response = await fetcher(`${baseUrl}/api/internal/absence-declarations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Timestamp': timestamp,
        'X-Internal-Signature': signature,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AbsenceDeclarationRelayError('Le serveur Web des déclarations est indisponible.', 502);
  }

  const body = await response.json().catch(() => ({ error: 'Réponse invalide du serveur Web.' }));
  if (!response.ok) {
    throw new AbsenceDeclarationRelayError(body?.error || 'La déclaration n’a pas pu être transmise.', response.status);
  }
  return { status: response.status, body };
}