import { recent } from "@discord-zero-bot/database/messages";
import { download } from "@discord-zero-bot/storage";
import { jsonSchema, tool } from "ai";
import type { Message } from "discord.js";

import { storedAttachments } from "../../archive/attachments.ts";

const openable = /^(image\/|video\/|application\/pdf$|text\/)/;

export function openAttachment(message: Message) {
  return tool({
    description:
      "Open an attachment saved from earlier in this channel and return its contents. Use the attachment names that read_chat reports; call it with an empty name to list what is saved.",
    inputSchema: jsonSchema<{ name: string }>({
      type: "object",
      properties: {
        name: { type: "string", description: "Attachment filename or part of it; empty lists the saved attachments" },
      },
      required: ["name"],
      additionalProperties: false,
    }),
    execute: async ({ name }) => {
      console.log(`[tool] #${message.channelId} message ${message.id} open_attachment ${JSON.stringify(name)}`);
      // ponytail: scans the last 200 messages; add an attachment index if channels outgrow that.
      const saved = (await recent(message.channelId, 200)).flatMap((entry) => storedAttachments(entry.discord_message));
      const needle = name.trim().toLowerCase();
      if (!needle) {
        const filenames = [...new Set(saved.map((attachment) => attachment.filename))];
        return {
          parts: [
            {
              type: "text" as const,
              text: filenames.length ? `Saved attachments: ${filenames.join(", ")}` : "No attachments saved here yet.",
            },
          ],
        };
      }
      const match = saved.find((attachment) => attachment.filename.toLowerCase().includes(needle));
      if (!match) return textResult(`No saved attachment matches "${name}".`);
      if (!match.storage_key) return textResult(`${match.filename} was never uploaded to storage.`);
      if (!openable.test((match.content_type ?? "").split(";")[0]?.trim() ?? ""))
        return textResult(`${match.filename} (${match.content_type ?? "unknown type"}) cannot be read directly.`);
      const bytes = await download(match.storage_key);
      // Strip parameters (e.g. "; charset=utf-8") so the media type stays a bare type/subtype.
      const mediaType = match.content_type?.split(";")[0]?.trim() || "application/octet-stream";
      return {
        parts: [
          { type: "text" as const, text: `${match.filename} (${mediaType}, ${bytes.byteLength} bytes):` },
          {
            type: "file" as const,
            data: { type: "data" as const, data: new Uint8Array(bytes) },
            mediaType,
            filename: match.filename,
          },
        ],
      };
    },
    toModelOutput: ({ output }) => ({ type: "content" as const, value: output.parts }),
  });
}

const textResult = (text: string) => ({ parts: [{ type: "text" as const, text }] });
