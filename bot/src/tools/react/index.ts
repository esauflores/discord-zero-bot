import { jsonSchema, tool } from "ai";

import { queueReaction } from "../../pipeline/effects.ts";
import type { Effect } from "../../pipeline/effects.ts";

/** Records a reaction instead of adding it; the deliver stage performs the write. */
export function reactToMessage(effects: Effect[]) {
  return tool({
    description:
      "Add one emoji reaction to the current message. Use only when a reaction is clearly warranted; otherwise do nothing.",
    inputSchema: jsonSchema<{ emoji: string }>({
      type: "object",
      properties: { emoji: { type: "string", description: "A single emoji, e.g. 😂" } },
      required: ["emoji"],
      additionalProperties: false,
    }),
    execute: async ({ emoji }) => queueReaction(effects, emoji) ?? "Reaction queued; it will be added.",
  });
}
