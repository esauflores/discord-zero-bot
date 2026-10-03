import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Message } from "discord.js";
import { Type } from "typebox";

import { recent, searchMemory, type MessageRow } from "../infra/database.ts";

function formatMessage(entry: MessageRow): string {
  const files = entry.discord_message.attachments.map(
    ({ filename, content_type, size }) => `${filename} (${content_type ?? "unknown type"}, ${size} bytes)`,
  );
  return `[msg:${entry.discord_id}] ${entry.created_at.toISOString()} ${entry.author_name}: ${entry.content}${files.length ? `\n  Attachments: ${files.join(", ")}` : ""}`;
}

export function readChat(message: Message) {
  return {
    name: "read_chat",
    label: "Read chat",
    description:
      "Read recent messages and search saved text or attachment metadata in this channel. File contents are unavailable.",
    parameters: Type.Object({ query: Type.String({ description: "Search query" }) }),
    execute: async (_id: string, { query }: { query: string }) => {
      console.log(`[tool] #${message.channelId} message ${message.id} read_chat`);
      const messages = await recent(message.channelId, 10);
      const latest = messages.length
        ? [...messages].reverse().map(formatMessage).join("\n")
        : "No recent messages found.";
      const hits = query.trim() ? await searchMemory(message.channelId, query.trim()) : [];
      const related = hits.map(formatMessage).join("\n") || "No matching channel messages.";
      return {
        content: [{ type: "text" as const, text: `Latest 10 messages:\n${latest}\n\nRelated history:\n${related}` }],
        details: {},
      };
    },
  } satisfies ToolDefinition;
}
