import { Logger } from "../utils/logger";

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

      logger.error(`Job execution failed: ${job.name} [ID: ${job.id}]`, err);

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
    // Simulate real networking/latency
    await new Promise(resolve => setTimeout(resolve, 150));

    // Force random mock failure on "test" jobs to demonstrate DLQ + retry mechanism
    if (job.name === "test-failure-simulation") {
      throw new Error("Network timeout: FCM Gateway failed to respond (Simulated Error).");
    }
  }

  public static getDLQ(): QueueJob[] {
    return deadLetterQueue;
  }

  public static clearDLQ() {
    deadLetterQueue.length = 0;
  }
}
