import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { type MessageRow, type StoredMessage, initMessages, rowToMessage } from "./messages.ts";

export type { MessageRow } from "./messages.ts";

const databasePath = process.env.SQLITE_PATH ?? "./data/messages.sqlite";
if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
const db = new Database(databasePath, { create: true });
db.run("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
initMessages(db);

export async function saveMessage(message: StoredMessage): Promise<void> {
  db.transaction(() => {
    db.query(
      "INSERT OR IGNORE INTO messages (guild_id, channel_id, discord_id, author_id, author_name, content, discord_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      message.guild_id,
      message.channel_id,
      message.discord_id,
      message.author_id,
      message.author_name,
      message.content,
      JSON.stringify(message.discord_message),
      message.created_at.toISOString(),
    );
    db.run(
      "DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY created_at DESC, id DESC LIMIT 1000)",
    );
  })();
}

export async function recent(channelId: string, limit = 50): Promise<MessageRow[]> {
  return db
    .query(
      "SELECT id, guild_id, channel_id, discord_id, author_id, author_name, content, discord_message, created_at FROM messages WHERE channel_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
    )
    .all(channelId, limit)
    .map((row) => rowToMessage(row as Record<string, unknown>));
}

export async function searchMemory(channelId: string, query: string): Promise<MessageRow[]> {
  const pattern = `%${query}%`;
  return db
    .query(
      "SELECT id, guild_id, channel_id, discord_id, author_id, author_name, content, discord_message, created_at FROM messages WHERE channel_id = ? AND (content LIKE ? OR discord_message LIKE ?) ORDER BY created_at DESC, id DESC LIMIT 10",
    )
    .all(channelId, pattern, pattern)
    .map((row) => rowToMessage(row as Record<string, unknown>));
}

export function closeDb(): void {
  db.close();
}
