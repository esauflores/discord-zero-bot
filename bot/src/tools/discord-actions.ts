import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { queueReaction, queueReply, type Effect } from "@/pipeline/effects.ts";

/** Records a reply instead of sending it; the deliver stage performs the write. */
export function respondInDiscord(effects: Effect[]) {
  return {
    name: "respond_in_discord",
    label: "Respond in Discord",
    description:
      "Reply to this Discord message. Use this tool to answer direct questions, greetings, and requests. Final assistant text is not delivered.",
    parameters: Type.Object({ text: Type.String({ description: "Reply text (up to 2000 characters)" }) }),
    execute: async (_id: string, { text }: { text: string }) => ({
      content: [{ type: "text" as const, text: queueReply(effects, text) ?? "Reply queued; it will be sent." }],
      details: {},
    }),
  } satisfies ToolDefinition;
}

/** Records a reaction instead of adding it; the deliver stage performs the write. */
export function reactToMessage(effects: Effect[]) {
  return {
    name: "react",
    label: "React",
    description: "Add one emoji reaction to the current message, only when warranted.",
    parameters: Type.Object({ emoji: Type.String({ description: "A single emoji, e.g. 😂" }) }),
    execute: async (_id: string, { emoji }: { emoji: string }) => ({
      content: [{ type: "text" as const, text: queueReaction(effects, emoji) ?? "Reaction queued; it will be added." }],
      details: {},
    }),
  } satisfies ToolDefinition;
}
