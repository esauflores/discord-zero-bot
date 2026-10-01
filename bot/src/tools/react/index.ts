import { jsonSchema, tool } from "ai";
import type { Message } from "discord.js";

export function reactToMessage(message: Message, state: { reacted: boolean }) {
  return tool({
    description:
      "Add one emoji reaction to the current message. Use only when a reaction is clearly warranted; otherwise do nothing.",
    inputSchema: jsonSchema<{ emoji: string }>({
      type: "object",
      properties: { emoji: { type: "string", description: "A single emoji, e.g. 😂" } },
      required: ["emoji"],
      additionalProperties: false,
    }),
    execute: async ({ emoji }) => {
      const reaction = emoji.trim();
      if (state.reacted) return "Already reacted to this message.";
      if (!reaction || [...reaction].length > 2) return "Reaction ignored.";
      try {
        await message.react(reaction);
      } catch (error) {
        console.error(`[react] #${message.channelId} message ${message.id}`, error);
        return "Reaction not allowed.";
      }
      state.reacted = true;
      console.log(`[react] #${message.channelId} message ${message.id} ${reaction}`);
      return "Reaction added.";
    },
  });
}
