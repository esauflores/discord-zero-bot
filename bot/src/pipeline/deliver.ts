import type { Stage } from "./context.ts";

/**
 * The only stage that writes to Discord. Runs the effects the model queued in
 * order, then falls back to the model's own text when it never asked to reply.
 */
export const deliver: Stage = async (ctx) => {
  const { message } = ctx;
  // Models answer in plain text instead of calling respond_in_discord often enough
  // that dropping the text silently loses real replies. Jev already decided this
  // message is addressed, so send the text rather than discarding it.
  if (!ctx.effects.some((effect) => effect.kind === "reply") && ctx.modelText.trim()) {
    ctx.effects.push({ kind: "reply", text: ctx.modelText.trim().slice(0, 2000) });
    ctx.fallback = true;
  }

  for (const effect of ctx.effects) {
    try {
      if (effect.kind === "reply") {
        await message.reply(effect.text);
        console.log(`[sent] #${message.channelId} message ${message.id} text${ctx.fallback ? " (fallback)" : ""}`);
      } else {
        await message.react(effect.emoji);
        console.log(`[react] #${message.channelId} message ${message.id} ${effect.emoji}`);
      }
    } catch (error) {
      console.error(`[deliver] #${message.channelId} message ${message.id} ${effect.kind} failed`, error);
    }
  }

  ctx.sent = ctx.effects.some((effect) => effect.kind === "reply");
  // A reaction counts as visible activity, so it is not "silent".
  const reacted = ctx.effects.some((effect) => effect.kind === "react");
  if (!ctx.sent && !reacted && !ctx.state.imageRequested)
    console.log(`[silent] #${message.channelId} message ${message.id}`);
};
