import { Logger } from "../utils/logger";
import { sendPushNotification, InvalidFcmTokenError } from "../services/fcm";
import { store } from "../store";

const logger = new Logger("QueueProcessor");

export interface QueueJob<T = any> {
  id: string;
  name: string;
  data: T;
  priority: number; // Higher is processed first
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  dedupeKey?: string;
  errorHistory: Array<{ timestamp: string; message: string }>;
}

// In-Memory Storage for Active and Dead-Letter Queues (DLQ)
export const activeQueue: QueueJob[] = [];
export const deadLetterQueue: QueueJob[] = [];
export const completedJobIds = new Set<string>(); // Idempotence check

export class QueueManager {
  /**
   * Add a job to the queue
   */
  public static addJob<T>(
    name: string,
    data: T,
    options: { priority?: number; maxAttempts?: number; dedupeKey?: string } = {}
  ): string {
    const priority = options.priority ?? 0;
    const maxAttempts = options.maxAttempts ?? 3;
    const dedupeKey = options.dedupeKey;
    const jobData = data as any;
    const parentId = jobData?.parentId;
    const token = jobData?.token;
    const maskedToken = token ? `${String(token).slice(0, 10)}...` : undefined;
    logger.info("[NOTIF_TRACE] addJob", {
      jobName: name,
      parentId,
      tokenPresent: Boolean(token),
      token: maskedToken,
      title: jobData?.title,
      message: jobData?.message,
      priority,
      dedupeKey
    });

    // Idempotency check using dedupeKey
    if (dedupeKey && completedJobIds.has(dedupeKey)) {
      logger.info(`Idempotency hit! Job with dedupeKey '${dedupeKey}' already processed. Skipping duplicate entry.`);
      return `skipped-${dedupeKey}`;
    }

    // Check if the exact dedupeKey is already in the active queue to prevent queuing duplicates
    if (dedupeKey && activeQueue.some(j => j.dedupeKey === dedupeKey)) {
      logger.info(`Job with dedupeKey '${dedupeKey}' is already active in queue. Ignoring duplicate entry.`);
      return `queued-${dedupeKey}`;
    }

    const job: QueueJob<T> = {
      id: `job-${Math.random().toString(36).substring(2, 11)}`,
      name,
      data,
      priority,
      attempts: 0,
      maxAttempts,
      createdAt: Date.now(),
      dedupeKey,
      errorHistory: []
    };

    activeQueue.push(job);
    // Sort active queue by priority (descending) and then creation time (ascending)
    activeQueue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);

    logger.info(`Job added to queue: ${name} [ID: ${job.id}]`, { jobId: job.id, priority, dedupeKey });
    
    // Automatically trigger processing in the background
    this.processNextJob();

    return job.id;
  }

  /**
   * Process jobs in queue with exponential backoff retries and DLQ routing
   */
  private static isProcessing = false;

  private static async processNextJob() {
    if (this.isProcessing || activeQueue.length === 0) return;
    this.isProcessing = true;

    const job = activeQueue.shift()!;
    const jobData = job.data as any;
    const maskedToken = jobData?.token ? `${String(jobData.token).slice(0, 10)}...` : undefined;
    logger.info("[NOTIF_TRACE] processNextJob start", {
      jobId: job.id,
      jobName: job.name,
      parentId: jobData?.parentId,
      tokenPresent: Boolean(jobData?.token),
      token: maskedToken,
      title: jobData?.title,
      message: jobData?.message,
      attempt: job.attempts + 1,
      maxAttempts: job.maxAttempts
    });
    logger.info(`Processing Job: ${job.name} [ID: ${job.id}, Attempt: ${job.attempts + 1}/${job.maxAttempts}]`);

    try {
      job.attempts++;
      
      // Simulate real processing of the notification
      await this.executeJobLogic(job);

      // Successfully processed
      if (job.dedupeKey) {
        completedJobIds.add(job.dedupeKey);
      }
      logger.info(`Job completed successfully: ${job.name} [ID: ${job.id}]`);

    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      job.errorHistory.push({
        timestamp: new Date().toISOString(),
        message: errorMessage
      });

      if (err instanceof InvalidFcmTokenError) {
        const invalidToken = err.token;
        const parentId = (job.data as any)?.parentId;

        logger.warn(`Invalid FCM token detected, removing it and not retrying job: ${job.name} [ID: ${job.id}]`, {
          jobId: job.id,
          token: invalidToken,
          parentId,
          error: err.originalError,
        });

        if (parentId) {
          try {
            await store.deletePushToken(parentId, invalidToken);
            logger.info(`Invalid FCM token removed from database`, { parentId, token: invalidToken });
          } catch (deleteError) {
            logger.error(`Failed to delete invalid FCM token from database`, deleteError, { parentId, token: invalidToken });
          }
        }

        if (job.dedupeKey) {
          completedJobIds.add(job.dedupeKey);
        }

        return;
      }

      const jobData = job.data as any;
      const maskedToken = jobData?.token ? `${String(jobData.token).slice(0, 10)}...` : undefined;
      logger.error(`Job execution failed: ${job.name} [ID: ${job.id}]`, err, {
        jobId: job.id,
        jobName: job.name,
        parentId: jobData?.parentId,
        token: maskedToken,
        title: jobData?.title,
        message: jobData?.message,
        attempts: job.attempts,
        errorHistory: job.errorHistory
      });

      if (job.attempts < job.maxAttempts) {
        // Calculate exponential backoff delay (e.g., 2^attempts * 100ms)
        const delay = Math.pow(2, job.attempts) * 100;
        logger.warn(`Scheduling retry for job: ${job.id} in ${delay}ms...`);
        
        setTimeout(() => {
          activeQueue.push(job);
          // Re-sort
          activeQueue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
          this.processNextJob();
        }, delay);

      } else {
        // Route to Dead Letter Queue (DLQ)
        logger.error(`Job failed maximum attempts: ${job.name} [ID: ${job.id}]. Moving to DLQ.`);
        deadLetterQueue.push(job);
        
        // Audit trail trail of failure
        logger.audit("JOB_DLQ_ROUTED", "QueueProcessor", { jobId: job.id, jobName: job.name, errors: job.errorHistory }, "FAILURE");
      }
    } finally {
      this.isProcessing = false;
      // Continue processing next job if any
      this.processNextJob();
    }
  }

  /**
   * Logic execution based on job type
   */
  private static async executeJobLogic(job: QueueJob): Promise<void> {
    const jobData = job.data as any;
    const maskedToken = jobData?.token ? `${String(jobData.token).slice(0, 10)}...` : undefined;
    logger.info("[NOTIF_TRACE] executeJobLogic started", {
      jobName: job.name,
      jobId: job.id,
      parentId: jobData?.parentId,
      tokenPresent: Boolean(jobData?.token),
      token: maskedToken,
      title: jobData?.title,
      message: jobData?.message,
      target: jobData?.target
    });

    try {
      await new Promise(resolve => setTimeout(resolve, 150));

      if (job.name.startsWith("send-notification-push")) {
        const {
          token,
          title,
          message,
          target = "home"
        } = job.data;

        if (!token) {
          throw new Error("FCM token missing");
        }

        const tokenPreview = token ? `${String(token).slice(0, 10)}...` : undefined;
        logger.info("[NOTIF_TRACE] About to call sendPushNotification", { parentId: jobData?.parentId, jobId: job.id, token: tokenPreview, title, message, target });
        await sendPushNotification(
          token,
          title,
          message,
          target
        );
        logger.info("[NOTIF_TRACE] FCM envoyé avec succès", { token: tokenPreview, title, target });

        logger.info("Push notification sent successfully", {
          title
        });

        return;
      }

      if (job.name.startsWith("send-notification-whatsapp")) {
        logger.info("WhatsApp delivery placeholder");
        return;
      }

      if (job.name.startsWith("send-notification-sms")) {
        logger.info("SMS delivery placeholder");
        return;
      }

      if (job.name === "test-failure-simulation") {
        throw new Error(
          "Network timeout: FCM Gateway failed to respond"
        );
      }
    } catch (err: any) {
      logger.error("[NOTIF_TRACE] executeJobLogic error", err, {
        jobId: job.id,
        jobName: job.name,
        parentId: jobData?.parentId,
        token: maskedToken,
        title: jobData?.title,
        message: jobData?.message,
      });
      throw err;
    }
  }

  public static getDLQ(): QueueJob[] {
    return deadLetterQueue;
  }

  public static clearDLQ() {
    deadLetterQueue.length = 0;
  }
}
