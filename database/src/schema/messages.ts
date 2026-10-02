import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { bigint, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { db } from "../index";

export const messages = pgTable(
  "messages",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
    guild_id: text("guild_id").notNull(),
    channel_id: text("channel_id").notNull(),
    discord_id: text("discord_id").notNull().unique(),
    author_id: text("author_id").notNull(),
    author_name: text("author_name").notNull(),
    content: text("content").notNull(),
    // Discord message snapshot, including attachment metadata; file bytes live in SeaweedFS.
    // Historical rows predate snapshots; new messages always populate this.
    discord_message: jsonb("discord_message"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("messages_channel_time_idx").on(table.channel_id, table.created_at.desc())],
);

export type MessageRow = typeof messages.$inferSelect;

export async function saveMessage(message: typeof messages.$inferInsert): Promise<void> {
  await db.insert(messages).values(message).onConflictDoNothing({ target: messages.discord_id });
}

export async function recent(channelId: string, limit = 50) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.channel_id, channelId))
    .orderBy(desc(messages.created_at))
    .limit(limit);
}

// Matches the message text or anything in its Discord snapshot, so a search can
// also find a message by its attachment filenames.
export async function searchMemory(channelId: string, query: string): Promise<MessageRow[]> {
  const pattern = `%${query}%`;
  return db
    .select()
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
