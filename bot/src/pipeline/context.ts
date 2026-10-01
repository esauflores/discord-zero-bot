import type { MessageRow } from "@discord-zero-bot/database/messages";
import type { Message } from "discord.js";

import type { Effect } from "./effects.ts";

/** Shared state a message moves through, stage by stage. */
export type ChatContext = {
  message: Message;
  receivedAt: number;
  /** Recent channel messages, newest first. */
  chat: MessageRow[];
  addressed: boolean;
  model: string;
  /** Whether background image work was started for this message. */
  state: { imageRequested: boolean };
  /** Discord writes the model asked for, executed in order by the deliver stage. */
  effects: Effect[];
  /** Text the model produced in its final step. */
  modelText: string;
  steps: number;
  /** Context block and files handed to the model. */
  promptText: string;
  promptFiles: { url: string; mediaType: string }[];
  /** True once the reply reached Discord. */
  sent: boolean;
  /** True when the reply came from the model's raw text, not a tool call. */
  fallback: boolean;
  /** Set by a stage to stop the chain (nothing to answer). */
  halt: boolean;
  timings: Record<string, number>;
};

/** A pipeline step. Set `ctx.halt` to stop; otherwise the chain continues. */
export type Stage = (ctx: ChatContext) => Promise<void>;
