import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Message } from "discord.js";
import { Type } from "typebox";

export function webSearch(message: Message) {
  return {
    name: "web_search",
    label: "Web search",
    description: "Search the web for external research.",
    parameters: Type.Object({ query: Type.String({ description: "Search query" }) }),
    execute: async (_id: string, { query }: { query: string }, signal?: AbortSignal) => {
      console.log(`[tool] #${message.channelId} message ${message.id} web_search`);
      const searchApiKey = process.env.BRAVE_API_KEY;
      let text = "search unavailable";
      if (searchApiKey) {
        try {
          const params = new URLSearchParams({ q: query, count: "5" });
          const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
            signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(signal ? [signal] : [])]),
            headers: { "X-Subscription-Token": searchApiKey, Accept: "application/json" },
          });
          if (response.ok) {
            const result = (await response.json()) as {
              web?: { results?: { title: string; url: string; description: string }[] };
            };
            text =
              result.web?.results?.map((hit) => `${hit.title} — ${hit.url}\n${hit.description}`).join("\n\n") ||
              "No web results.";
          }
        } catch {
          // An unavailable search must not fail the whole reply.
        }
      }
      return { content: [{ type: "text" as const, text }], details: {} };
    },
  } satisfies ToolDefinition;
}
