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

/** jobId = session id, so a session can never be queued for sending twice. */
export const enqueueMessageSend = (sessionId: string) =>
  messageQueue().add("send", { sessionId }, { jobId: `send-${sessionId}` });
