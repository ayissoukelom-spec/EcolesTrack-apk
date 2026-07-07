import { store } from "../store";
import { QueueManager } from "../jobs/queue";
import { Logger } from "../utils/logger";
import { NotificationChannel } from "../../src/types";

const logger = new Logger("NotificationService");

export class NotificationService {
  /**
   * Orchestrates multi-channel delivery based on parent consents and quiet hours
   */
  public static async dispatchNotification(
    parentId: string,
    title: string,
    message: string,
    category: 'absence' | 'grade' | 'test',
    metadata: any = {},
    dedupeKey?: string
  ) {
    logger.info(`Orchestrating notification for Parent ID: ${parentId}`, { category, dedupeKey });

    // 1. Fetch parent preferences and consent from DB
    const preferences = store.getNotificationPreferences(parentId);
    const consents = store.getConsentsOfParent(parentId);

    const isPushAuthorized = preferences.pushEnabled;
    const isSmsAuthorized = preferences.smsEnabled && consents.some(c => c.channel === "sms" && c.granted);
    const isWhatsappAuthorized = preferences.whatsappEnabled && consents.some(c => c.channel === "whatsapp" && c.granted);

    // 2. Check Quiet Hours Window
    if (this.isWithinQuietHours(preferences.quietHoursStart, preferences.quietHoursEnd)) {
      logger.info(`Quiet Hours active for parent ${parentId}. Scheduling notification with lower priority or buffering.`);
      // In a real system, we'd buffer. For demonstration, we'll process with low priority and log a quiet-hours warning
      metadata.quietHoursApplied = true;
    }

    // 3. Select Channels and Queue Jobs
    const channelsToDeliver: NotificationChannel[] = [];
    if (isPushAuthorized) channelsToDeliver.push("push");
    if (isWhatsappAuthorized) channelsToDeliver.push("whatsapp");
    if (isSmsAuthorized) channelsToDeliver.push("sms");

    if (channelsToDeliver.length === 0) {
      logger.warn(`No authorized notification channels for parent: ${parentId}. Fallback to in-app notification only.`);
      channelsToDeliver.push("push"); // In-app / Push as fallback
    }

    // Add delivery jobs to queue
    const jobsTriggered: string[] = [];
    for (const channel of channelsToDeliver) {
      const priority = category === "absence" ? 10 : 5; // Absences have higher priority
      const jobName = `send-notification-${channel}`;
      const jobDedupeKey = dedupeKey ? `${dedupeKey}-${channel}` : undefined;

      const jobId = QueueManager.addJob(jobName, {
        parentId,
        channel,
        title,
        message,
        category,
        metadata
      }, {
        priority,
        dedupeKey: jobDedupeKey,
        maxAttempts: 3
      });

      jobsTriggered.push(jobId);
    }

    // Also call existing store orchestrator to keep UI logs completely aligned and updated!
    const legacyResult = await store.triggerMultiChannelNotification(
      parentId,
      title,
      message,
      category,
      metadata,
      dedupeKey
    );

    return {
      success: true,
      channels: channelsToDeliver,
      jobs: jobsTriggered,
      legacyResult
    };
  }

  /**
   * Checks if current time is within quiet hours (format 'HH:MM')
   */
  private static isWithinQuietHours(start: string | null | undefined, end: string | null | undefined): boolean {
    if (!start || !end) return false;

    try {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const [startH, startM] = start.split(":").map(Number);
      const [endH, endM] = end.split(":").map(Number);

      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      if (startMinutes < endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
      } else {
        // Quiet hours cross midnight
        return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
      }
    } catch (e) {
      logger.error("Failed to parse quiet hours, skipping window validation", e);
      return false;
    }
  }
}
