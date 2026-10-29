export interface AuthenticatedMobileParent {
  id: string;
  role: string;
}

export class MobileParentVisitAuthorizationError extends Error {
  constructor() {
    super('A parent session is required to record a mobile visit.');
    this.name = 'MobileParentVisitAuthorizationError';
  }
}

export type MobileParentVisitOutcome =
  | 'recorded'
  | 'coalesced'
  | 'parent_not_found'
  | 'parent_role_invalid';

export class MobileVisitRateLimiter {
  private readonly clients = new Map<string, { count: number; resetTime: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  consume(parentId: string, now = Date.now()): { allowed: boolean; resetInSeconds: number } {
    for (const [id, state] of this.clients) {
      if (now > state.resetTime) this.clients.delete(id);
    }

    const state = this.clients.get(parentId);
    if (!state || now > state.resetTime) {
      this.clients.set(parentId, { count: 1, resetTime: now + this.windowMs });
      return { allowed: true, resetInSeconds: 0 };
    }

    if (state.count >= this.limit) {
      return {
        allowed: false,
        resetInSeconds: Math.max(1, Math.ceil((state.resetTime - now) / 1000)),
      };
    }

    state.count += 1;
    return { allowed: true, resetInSeconds: 0 };
  }
}

export async function recordAuthenticatedMobileParentVisit(
  parent: AuthenticatedMobileParent | undefined,
  updateVisit: (parentId: string) => Promise<MobileParentVisitOutcome>,
): Promise<MobileParentVisitOutcome> {
  if (!parent || parent.role !== 'parent') {
    throw new MobileParentVisitAuthorizationError();
  }

  const outcome = await updateVisit(parent.id);
  if (!['recorded', 'coalesced', 'parent_not_found', 'parent_role_invalid'].includes(outcome)) {
    throw new Error('Unexpected mobile parent visit outcome.');
  }
  return outcome;
}
