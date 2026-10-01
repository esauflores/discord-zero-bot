import { jsonSchema, tool } from "ai";
import type { Message } from "discord.js";

export function webSearch(message: Message) {
  return tool({
    description: "Search the web for external research.",
    inputSchema: jsonSchema<{ query: string }>({
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
      additionalProperties: false,
    }),
    execute: async ({ query }) => {
      console.log(`[tool] #${message.channelId} message ${message.id} web_search`);
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
  });
}
