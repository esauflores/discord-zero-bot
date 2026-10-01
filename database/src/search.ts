import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import { db } from "./index";
import { messageColumns, type MessageRow } from "./messages";
import { messages } from "./schema";

export type SearchHit = Pick<MessageRow, "discord_id" | "author_name" | "content" | "created_at" | "discord_message">;

// Matches the message text or anything in its Discord snapshot, so a search can
// also find a message by its attachment filenames.
export async function searchMemory(channelId: string, query: string): Promise<SearchHit[]> {
  const pattern = `%${query}%`;
  return db
    .select(messageColumns)
    .from(messages)
    .where(
      and(
        eq(messages.channel_id, channelId),
        or(ilike(messages.content, pattern), sql`${messages.discord_message}::text ilike ${pattern}`),
      ),
    )
    .orderBy(desc(messages.created_at))
    .limit(10);
}
