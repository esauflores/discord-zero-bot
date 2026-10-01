import { recent } from "@discord-zero-bot/database/messages";

import { classifyMessage } from "../ai/classify.ts";
import type { Stage } from "./context.ts";

/** Loads the channel history, then lets Jev decide whether to answer and with which model. */
export const gate: Stage = async (ctx) => {
  // The bot's own replies are recorded for context but never answered.
  if (ctx.message.author?.bot) {
    ctx.halt = true;
    return;
  }
  const received = Date.now();
  ctx.chat = await recent(ctx.message.channelId, 11);
  ctx.timings.db = Date.now() - received;

  const previous = ctx.chat
    .filter((entry) => entry.discord_id !== ctx.message.id)
    .slice(0, 10)
    .reverse();

  const classified = Date.now();
  const { addressed, model } = await classifyMessage(ctx.message, previous);
  ctx.timings.jev = Date.now() - classified;
  ctx.addressed = addressed;
  ctx.model = model;
  if (!addressed) {
    ctx.halt = true;
    return;
  }
  console.log(`[thinking] #${ctx.message.channelId} message ${ctx.message.id} model=${model} (addressed)`);
};
