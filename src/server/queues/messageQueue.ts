import { getQueue } from "./conversationQueue";
import { QUEUES, type MessageJob } from "./names";

export const messageQueue = () =>
  getQueue<MessageJob>(QUEUES.message, {
    // One attempt only: the sender is not idempotent per message, and it already handles
    // FloodWait itself. A failed session is reported, never silently re-sent.
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { age: 3600, count: 200 },
      removeOnFail: { age: 7 * 86_400, count: 500 },
    },
  });

/**
 * Enqueues a send job. `attempt` defaults to 0 (first send); rescue passes a non-zero value so
 * the jobId is unique and BullMQ does not silently skip it because an old failed job still exists.
 */
export const enqueueMessageSend = (sessionId: string, attempt = 0) =>
  messageQueue().add(
    "send",
    { sessionId },
    { jobId: attempt === 0 ? `send-${sessionId}` : `send-${sessionId}-${attempt}` },
  );
