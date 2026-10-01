import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import type { Message } from "discord.js";

import { recent } from "./db/messages.ts";

const baseURL = process.env.AI_BASE_URL;
const apiKey = process.env.AI_API_KEY;
const modelId = process.env.AI_MODEL;
if (!baseURL || !apiKey || !modelId) {
  throw new Error("AI_BASE_URL, AI_API_KEY, and AI_MODEL are required");
}

const provider = createOpenAICompatible({ name: "openai-compatible", baseURL, apiKey });

export async function reply(message: Message): Promise<string> {
  const memory = await recent(message.channelId, 50);
  const context = memory
    .reverse()
    .map((entry) => `${entry.author_name}: ${entry.content}`)
    .join("\n");
  const { text } = await generateText({
    model: provider(modelId!),
    system:
      "You are a regular participant in this conversation. Reply naturally and concisely, in the language the person wrote in. Use the remembered channel context when it helps. Sound like a person, not an assistant — no bullet-lists-of-helptext, don't announce being an AI unless asked.",
    messages: [
      {
        role: "user",
        content: `Remembered channel context:\n${context || "(none)"}\n\n${message.author.username}: ${message.content}`,
      },
    ],
  });
  return text;
}
