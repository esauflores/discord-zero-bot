import type { Database } from "bun:sqlite";

export type StoredAttachment = {
  id: string;
  filename: string;
  size: number;
  content_type: string | null;
  description: string | null;
  url: string;
  proxy_url: string;
  width: number | null;
  height: number | null;
};

export type DiscordSnapshot = {
  id: string;
  guild_id: string;
  channel_id: string;
  author: { id: string; username: string; global_name: string | null; avatar: string | null; bot: boolean };
  content: string;
  timestamp: string;
  edited_timestamp: string | null;
  type: number;
  pinned: boolean;
  tts: boolean;
  flags: number;
  mentions: { id: string; username: string }[];
  mention_roles: string[];
  mention_everyone: boolean;
  message_reference: unknown;
  embeds: unknown[];
  components: unknown[];
  attachments: StoredAttachment[];
};

export type StoredMessage = {
  guild_id: string;
  channel_id: string;
  discord_id: string;
  author_id: string;
  author_name: string;
  content: string;
  discord_message: DiscordSnapshot;
  created_at: Date;
};

export type MessageRow = StoredMessage & { id: number };

export function initMessages(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    discord_id TEXT NOT NULL UNIQUE,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    content TEXT NOT NULL,
    discord_message TEXT NOT NULL,
    created_at TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS messages_channel_time_idx ON messages(channel_id, created_at DESC);`);

  db.run("DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY created_at DESC, id DESC LIMIT 1000)");
}

export function rowToMessage(row: Record<string, unknown>): MessageRow {
  let discordMessage: DiscordSnapshot;
  try {
    discordMessage = JSON.parse(row.discord_message as string) as DiscordSnapshot;
  } catch (error) {
    throw new Error("Corrupt message snapshot in SQLite", { cause: error });
  }
  return { ...row, discord_message: discordMessage, created_at: new Date(row.created_at as string) } as MessageRow;
}
