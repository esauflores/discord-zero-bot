import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, jsonSchema, stepCountIs, tool } from "ai";
import type { Message } from "discord.js";

import { recent } from "./db/messages.ts";
import { searchMemory } from "./db/search.ts";
import { latest } from "./db/summaries.ts";

const baseURL = process.env.AI_BASE_URL;
const apiKey = process.env.AI_API_KEY;
const modelId = process.env.AI_MODEL;
if (!baseURL || !apiKey || !modelId) {
  throw new Error("AI_BASE_URL, AI_API_KEY, and AI_MODEL are required");
}

const provider = createOpenAICompatible({ name: "openai-compatible", baseURL, apiKey });
const querySchema = jsonSchema<{ query: string }>({
  type: "object",
  properties: { query: { type: "string", description: "Search query" } },
  required: ["query"],
  additionalProperties: false,
});

export async function reply(message: Message): Promise<string> {
  const [memory, summary] = await Promise.all([recent(message.channelId, 50), latest(message.channelId)]);
  const context = memory
    .reverse()
    .map((entry) => `${entry.author_name}: ${entry.content}`)
    .join("\n");
  const { text } = await generateText({
    model: provider(modelId!),
    system:
      "You are a regular participant in this conversation. Reply naturally and concisely, in the language the person wrote in. Use the remembered channel context when it helps. Sound like a person, not an assistant — no bullet-lists-of-helptext, don't announce being an AI unless asked. Use search_memory for relevant channel history and web_search when external research would help.",
    messages: [
      {
        role: "user",
        content: `Large channel memory:\n${summary?.content ?? "(none)"}\n\nRecent channel context:\n${context || "(none)"}\n\n${message.author.username}: ${message.content}`,
      },
    ],
    tools: {
      search_memory: tool({
        description: "Search this channel's recorded messages and internal summaries.",
        inputSchema: querySchema,
        execute: async ({ query }) => {
          const hits = await searchMemory(message.channelId, query);
          return hits.length
            ? hits
                .map(
                  (hit) =>
                    `${hit.kind} (${hit.created_at.toISOString()})${"author_name" in hit ? ` ${hit.author_name}:` : ""} ${hit.content}`,
                )
                .join("\n")
            : "No matching channel memories.";
        },
      }),
      web_search: tool({
        description: "Search the web for external research.",
        inputSchema: querySchema,
        execute: async ({ query }) => {
          const searchApiKey = process.env.BRAVE_API_KEY;
          if (!searchApiKey) return "search unavailable";
          try {
            const params = new URLSearchParams({ q: query, count: "5" });
            const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
              headers: { "X-Subscription-Token": searchApiKey, Accept: "application/json" },
            });
            if (!response.ok) return "search unavailable";
            const result = (await response.json()) as {
              web?: { results?: { title: string; url: string; description: string }[] };
            };
            return (
              result.web?.results?.map((hit) => `${hit.title} — ${hit.url}\n${hit.description}`).join("\n\n") ||
              "No web results."
            );
          } catch {
            return "search unavailable";
          }
        },
      }),
    },
    stopWhen: stepCountIs(6),
  });
  return text;
}
