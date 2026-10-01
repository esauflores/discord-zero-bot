import { bigint, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
    created_at: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("messages_channel_time_idx").on(table.channel_id, table.created_at.desc())],
);
