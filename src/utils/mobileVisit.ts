export const MOBILE_VISIT_RESUME_THRESHOLD_MS = 5 * 60 * 1000;

export type RecordMobileVisit = () => Promise<void>;

export class MobileVisitTracker {
  private parentId: string | null = null;
  private appOpenRecorded = false;
  private backgroundedAt: number | null = null;
  private pendingVisit: Promise<boolean> | null = null;

  setAuthenticatedParent(parentId: string | null): void {
    if (parentId === this.parentId) return;
    this.parentId = parentId;
    this.appOpenRecorded = false;
    this.backgroundedAt = null;
    this.pendingVisit = null;
  }

  async recordAppOpen(parentId: string, recordVisit: RecordMobileVisit): Promise<boolean> {
    if (!parentId || this.parentId !== parentId || this.appOpenRecorded) return false;
    return this.recordOnce(recordVisit, () => {
      this.appOpenRecorded = true;
    });
  }

  markBackgrounded(parentId: string, at = Date.now()): void {
    if (!parentId || this.parentId !== parentId || this.backgroundedAt !== null) return;
    this.backgroundedAt = at;
  }

  async recordForegroundReturn(
    parentId: string,
    recordVisit: RecordMobileVisit,
    at = Date.now(),
  ): Promise<boolean> {
    if (!parentId || this.parentId !== parentId || this.backgroundedAt === null) return false;

    const backgroundDuration = at - this.backgroundedAt;
    this.backgroundedAt = null;
    if (backgroundDuration < MOBILE_VISIT_RESUME_THRESHOLD_MS) return false;

    return this.recordOnce(recordVisit);
  }

  private async recordOnce(
    recordVisit: RecordMobileVisit,
    onSuccess?: () => void,
  ): Promise<boolean> {
    if (this.pendingVisit) return this.pendingVisit;

    const operation = recordVisit().then(() => {
      onSuccess?.();
      return true;
    }).finally(() => {
      if (this.pendingVisit === operation) this.pendingVisit = null;
    });
    this.pendingVisit = operation;
    return operation;
  }
}
