import { recent, searchMemory, type MessageRow } from "@discord-zero-bot/database";
import { jsonSchema, tool } from "ai";
import type { Message } from "discord.js";

import { storedAttachments } from "@/media/index.ts";

function formatMessage(entry: MessageRow): string {
  const files = storedAttachments(entry.discord_message).map(
    ({ filename, content_type, size }) => `${filename} (${content_type ?? "unknown type"}, ${size} bytes)`,
  );
  return `[msg:${entry.discord_id}] ${entry.created_at.toISOString()} ${entry.author_name}: ${entry.content}${
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
