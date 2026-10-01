import { jsonSchema, tool } from "ai";
import type { Message } from "discord.js";

export function respondInDiscord(message: Message, state: { responded: boolean }) {
  return tool({
    description: "Reply to this Discord message. Call only when you want to speak; otherwise stay silent.",
    inputSchema: jsonSchema<{ text: string }>({
      type: "object",
      properties: { text: { type: "string", description: "Reply text (up to 2000 characters)" } },
      required: ["text"],
      additionalProperties: false,
    }),
    execute: async ({ text }) => {
      if (state.responded) return "Already responded to this message.";
      if (!text.trim()) return "Empty reply ignored.";
      await message.reply(text.trim().slice(0, 2000));
      state.responded = true;
      console.log(`[sent] #${message.channelId} message ${message.id} text`);
      return "Reply sent.";
    },
  });
}
