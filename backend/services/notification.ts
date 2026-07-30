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
    parentId: string | string[],
    title: string,
    message: string,
    category: 'absence' | 'grade' | 'test',
    metadata: any = {},
    dedupeKey?: string
  ) {
    const effectiveParentIds = await this.resolveParentIds(parentId, metadata);
    logger.info(`Orchestrating notification for Parent IDs: ${effectiveParentIds.join(", ") || "<none>"}`, { category, dedupeKey });

    if (effectiveParentIds.length === 0) {
      logger.warn("No parent IDs resolved for notification dispatch.");
      return {
        success: true,
        channels: [],
        jobs: []
      };
    }

    const jobsTriggered: string[] = [];
    const channelsToDeliver: NotificationChannel[] = [];

    for (const effectiveParentId of effectiveParentIds) {
      // 1. Fetch parent preferences and consent from DB
      const preferences = await store.getNotificationPreferences(effectiveParentId);
      const consents = await store.getConsentsOfParent(effectiveParentId);

      const isPushAuthorized = preferences.pushEnabled;
      const isSmsAuthorized = preferences.smsEnabled && consents.some(c => c.channel === "sms" && c.consentGranted);
      const isWhatsappAuthorized = preferences.whatsappEnabled && consents.some(c => c.channel === "whatsapp" && c.consentGranted);

      // 2. Check Quiet Hours Window
      if (this.isWithinQuietHours(preferences.quietHoursStart, preferences.quietHoursEnd)) {
        logger.info(`Quiet Hours active for parent ${effectiveParentId}. Scheduling notification with lower priority or buffering.`);
        metadata.quietHoursApplied = true;
      }

      // 3. Select Channels and Queue Jobs
      const devices = await store.getDevicesOfParent(effectiveParentId);
      const pushTokens = Array.from(new Set(
        devices
          .map((device) => device.pushToken)
          .filter((token): token is string => Boolean(token))
      ));

      logger.info("Devices found", { parentId: effectiveParentId, devices });
      if (pushTokens.length === 0 && isPushAuthorized) {
        logger.warn(`No devices registered for parent: ${effectiveParentId}. Push skipped.`);
      }

      const parentChannelsToDeliver: NotificationChannel[] = [];

      if (isPushAuthorized && pushTokens.length > 0) {
        parentChannelsToDeliver.push("push");
      }

      if (isWhatsappAuthorized) {
        parentChannelsToDeliver.push("whatsapp");
      }

      if (isSmsAuthorized) {
        parentChannelsToDeliver.push("sms");
      }

      if (parentChannelsToDeliver.length === 0) {
        logger.warn(
          `No delivery channels available for parent: ${effectiveParentId}. In-app notification only.`
        );
      }

      for (const channel of parentChannelsToDeliver) {
        const priority = category === "absence" ? 10 : 5;
        const jobName = `send-notification-${channel}`;

        if (channel === "push") {
          for (const token of pushTokens) {
            const jobDedupeKey = dedupeKey ? `${dedupeKey}-${channel}-${token}` : undefined;
            const jobId = QueueManager.addJob(jobName, {
              parentId: effectiveParentId,
              channel,
              title,
              message,
              category,
              metadata,
              token
            }, {
              priority,
              dedupeKey: jobDedupeKey,
              maxAttempts: 3
            });

            jobsTriggered.push(jobId);
          }
        } else {
          const jobDedupeKey = dedupeKey ? `${dedupeKey}-${channel}` : undefined;
          const jobId = QueueManager.addJob(jobName, {
            parentId: effectiveParentId,
            channel,
            title,
            message,
            category,
            metadata,
            token: undefined
          }, {
            priority,
            dedupeKey: jobDedupeKey,
            maxAttempts: 3
          });

          jobsTriggered.push(jobId);
        }
      }

      parentChannelsToDeliver.forEach((channel) => channelsToDeliver.push(channel));
    }

    return {
      success: true,
      channels: Array.from(new Set(channelsToDeliver)),
      jobs: jobsTriggered
    };
  }

  private static async resolveParentIds(parentId: string | string[] | undefined, metadata: any = {}): Promise<string[]> {
    if (Array.isArray(parentId)) {
      return parentId.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    }

    if (typeof parentId === "string" && parentId.trim().length > 0) {
      return [parentId];
    }

    if (Array.isArray(metadata?.parentIds)) {
      return metadata.parentIds
        .map((value: unknown) => (typeof value === "string" ? value : String(value)))
        .filter((value: string) => value.trim().length > 0);
    }

    if (Array.isArray(metadata?.childIds) && metadata.childIds.length > 0) {
      return store.getParentIdsForChildren(metadata.childIds);
    }

    return [];
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
