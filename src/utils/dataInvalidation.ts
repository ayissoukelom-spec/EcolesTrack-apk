export interface DataInvalidation {
  domain: string;
  eventId: string;
  entityIds?: string[];
  revision?: string;
}

export type ParentDataDomain =
  | "grades"
  | "attendance"
  | "absence-declarations"
  | "finance"
  | "academics"
  | "bulletins"
  | "notifications";

const parentDataDomains = new Set<ParentDataDomain>([
  "grades",
  "attendance",
  "absence-declarations",
  "finance",
  "academics",
  "bulletins",
  "notifications",
]);

export function parseDataInvalidation(value: unknown): DataInvalidation | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.domain !== "string"
    || !/^[a-z][a-z0-9_-]{0,39}$/.test(candidate.domain)
    || !parentDataDomains.has(candidate.domain as ParentDataDomain)
    || typeof candidate.eventId !== "string"
    || candidate.eventId.length === 0
    || candidate.eventId.length > 200) {
    return null;
  }

  const event: DataInvalidation = {
    domain: candidate.domain,
    eventId: candidate.eventId,
  };
  if (Array.isArray(candidate.entityIds)) {
    event.entityIds = candidate.entityIds
      .filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 64)
      .slice(0, 100);
  }
  if (typeof candidate.revision === "string" && candidate.revision.length <= 64) {
    event.revision = candidate.revision;
  }
  return event;
}

export function shouldRefreshParentDataForInvalidation(
  event: DataInvalidation,
  domain: ParentDataDomain,
  selectedChildId?: string,
): boolean {
  if (event.domain !== domain) return false;
  if (!selectedChildId || !event.entityIds?.length) return true;
  return event.entityIds.includes(selectedChildId);
}

export function shouldRefreshGradesForInvalidation(
  event: DataInvalidation,
  selectedChildId: string | undefined,
): boolean {
  if (!selectedChildId) return false;
  return shouldRefreshParentDataForInvalidation(event, "grades", selectedChildId);
}
