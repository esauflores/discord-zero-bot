import { and, desc, eq, gte } from "drizzle-orm";

import { db } from "./index";
import { messages } from "./schema";

export type MessageRow = typeof messages.$inferSelect;

export const messageColumns = {
  discord_id: messages.discord_id,
  author_name: messages.author_name,
  content: messages.content,
  created_at: messages.created_at,
  discord_message: messages.discord_message,
};

export async function saveMessage(message: typeof messages.$inferInsert): Promise<void> {
  await db.insert(messages).values(message).onConflictDoNothing({ target: messages.discord_id });
}

export async function context(channelId: string, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return db
    .select()
    .from(messages)
    .where(and(eq(messages.channel_id, channelId), gte(messages.created_at, since)))
    .orderBy(messages.created_at);
}

export async function recent(channelId: string, limit = 50) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.channel_id, channelId))
    .orderBy(desc(messages.created_at))
    .limit(limit);
}
