import { desc, eq } from "drizzle-orm";

import { db } from "./index.ts";
import { summaries } from "./schema.ts";

export async function latest(channelId: string) {
  const [summary] = await db
    .select()
    .from(summaries)
    .where(eq(summaries.channel_id, channelId))
    .orderBy(desc(summaries.watermark_to))
    .limit(1);
  return summary;
}

export async function insert(summary: typeof summaries.$inferInsert): Promise<void> {
  await db.insert(summaries).values(summary);
}

export async function maxWatermark(channelId: string): Promise<Date | undefined> {
  return (await latest(channelId))?.watermark_to;
}
