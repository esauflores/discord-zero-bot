/** Background work that outlives the message that started it. */
export type Task = {
  name: string;
  /** Human-readable detail (an image prompt, for example). */
  detail: string;
};

const running = new Map<string, { task: Task; startedAt: number }>();

/**
 * Starts background work and tracks it per channel, so a later message can be told
 * what is already running instead of starting it twice.
 *
 * ponytail: process-local and one task per channel; a durable queue goes behind this
 * same interface if work must survive a restart or run concurrently.
 */
export function startTask(channelId: string, task: Task, run: () => Promise<void>): void {
  const entry = { task, startedAt: Date.now() };
  running.set(channelId, entry);
  void run()
    .catch((error: unknown) => console.error(`[task] ${task.name} #${channelId} failed`, error))
    .finally(() => {
      // Only clear the entry this call created, so a later task is not clobbered.
      if (running.get(channelId) === entry) running.delete(channelId);
    });
}

export function pendingTasks(channelId: string): { task: Task; ageMs: number }[] {
  const entry = running.get(channelId);
  return entry ? [{ task: entry.task, ageMs: Date.now() - entry.startedAt }] : [];
}
