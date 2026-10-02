import { jsonSchema, tool } from "ai";

import { queueReply } from "@/pipeline/effects.ts";
import type { Effect } from "@/pipeline/effects.ts";

/** Records a reply instead of sending it; the deliver stage performs the write. */
export function respondInDiscord(effects: Effect[]) {
  return tool({
    description: "Reply to this Discord message. Call only when you want to speak; otherwise stay silent.",
    inputSchema: jsonSchema<{ text: string }>({
      type: "object",
      properties: { text: { type: "string", description: "Reply text (up to 2000 characters)" } },
      required: ["text"],
      additionalProperties: false,
    }),
    execute: async ({ text }) => queueReply(effects, text) ?? "Reply queued; it will be sent.",
  });
}
