import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { StoredMessage } from "../src/infra/messages.ts";

const directory = mkdtempSync(join(tmpdir(), "zero-sqlite-"));
process.env.SQLITE_PATH = join(directory, "nested", "messages.sqlite");
const { saveMessage, recent, searchMemory, closeDb } = await import("../src/infra/database.ts");
const message = (id: number, channel = "channel"): StoredMessage => ({
  guild_id: "guild",
  channel_id: channel,
  discord_id: String(id),
  author_id: "user",
  author_name: "User",
  content: `message ${id}`,
  created_at: new Date(id * 1000),
  discord_message: {
    id: String(id),
    guild_id: "guild",
    channel_id: channel,
    author: { id: "user", username: "User", global_name: null, avatar: null, bot: false },
    content: `message ${id}`,
    timestamp: new Date(id * 1000).toISOString(),
    edited_timestamp: null,
    type: 0,
    pinned: false,
    tts: false,
    flags: 0,
    mentions: [],
    mention_roles: [],
    mention_everyone: false,
    message_reference: null,
    embeds: [],
    components: [],
    attachments: [
      {
        id: "file",
        filename: "receipt.pdf",
        size: 42,
        content_type: "application/pdf",
        description: null,
        url: "https://cdn.discordapp.com/file",
        proxy_url: "https://media.discordapp.net/file",
        width: null,
        height: null,
      },
    ],
  },
});
try {
  for (let id = 0; id < 1002; id++) await saveMessage(message(id));
  await saveMessage(message(1001)); // Duplicate delivery must not add another row.
  const rows = await recent("channel", 2000);
  assert.equal(rows.length, 1000);
  assert.equal(rows[0]?.discord_id, "1001");
  assert.equal(rows.at(-1)?.discord_id, "2");
  assert.deepEqual(rows[0]?.created_at, new Date(1001_000));
  assert.deepEqual(rows[0]?.discord_message, message(1001).discord_message);
  assert.equal((await searchMemory("channel", "receipt.pdf")).length, 10);
  assert.equal((await searchMemory("other", "receipt.pdf")).length, 0);
  await saveMessage(message(1002, "other"));
  assert.equal((await recent("other"))[0]?.discord_id, "1002");
  assert.equal((await recent("channel", 2000)).length, 999);
  closeDb();
  const reopened = new Database(process.env.SQLITE_PATH);
  try {
    assert.equal(reopened.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM messages").get()?.count, 1000);
    assert.equal(
      reopened
        .query<{ discord_id: string }, []>("SELECT discord_id FROM messages ORDER BY created_at DESC LIMIT 1")
        .get()?.discord_id,
      "1002",
    );
  } finally {
    reopened.close();
  }
  console.log(
    "SQLite smoke check passed: persistence, deduplication, 1,000-row retention, metadata search, channel isolation.",
  );
} finally {
  closeDb();
  rmSync(directory, { recursive: true, force: true });
}
