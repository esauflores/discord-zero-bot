import { recent } from "@discord-zero-bot/database/messages";
import { searchMemory } from "@discord-zero-bot/database/search";
import { jsonSchema, tool } from "ai";
import type { Message } from "discord.js";

import { storedAttachments } from "../../media/index.ts";

// Structural, not the exact row shape: `searchMemory` selects a subset and older
// rows have no snapshot, so only presence of the snapshot is required.
type ChatEntry = {
  created_at: Date;
  author_name: string;
  content: string;
  discord_id?: string;
  discord_message?: unknown;
};

function formatMessage(entry: ChatEntry): string {
  const files = storedAttachments(entry.discord_message).map(
    ({ filename, content_type, size }) => `${filename} (${content_type ?? "unknown type"}, ${size} bytes)`,
  );
  const handle = entry.discord_id ? `[msg:${entry.discord_id}] ` : "";
  return `${handle}${entry.created_at.toISOString()} ${entry.author_name}: ${entry.content}${
    files.length ? `\n  Attachments: ${files.join(", ")}` : ""
  }`;
}

export function readChat(message: Message) {
  return tool({
    description:
      "Read the latest 10 messages in this channel and related older messages for a topic, including attachment names, types, and sizes. Use open_attachment to read one.",
    inputSchema: jsonSchema<{ query: string }>({
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
      additionalProperties: false,
    }),
    execute: async ({ query }) => {
      console.log(`[tool] #${message.channelId} message ${message.id} read_chat`);
      const messages = await recent(message.channelId, 10);
      const latest = messages.length ? messages.reverse().map(formatMessage).join("\n") : "No recent messages found.";
      const hits = query.trim() ? await searchMemory(message.channelId, query.trim()) : [];
      const related = hits.map(formatMessage).join("\n") || "No matching channel messages.";
      return `Latest 10 messages:\n${latest}\n\nRelated history:\n${related}`;
    },
  });
}
