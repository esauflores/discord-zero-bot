import type { Message } from "discord.js";

/**
 * Something a capability wants to happen in Discord. Tools record these instead of
 * writing directly, so `deliver` is the only place that talks to Discord and can
 * de-duplicate what a multi-step model produces.
 */
export type Effect = { kind: "reply"; text: string } | { kind: "react"; emoji: string };

/**
 * Undoes JSON unicode escaping a model sometimes emits into its own reply text, so
 * Discord shows the accented character instead of a literal "\\u00f3". Two passes,
 * because a model can escape an already-escaped string.
 */
function unescape(value: string): string {
  let text = value;
  for (let pass = 0; pass < 2 && text.includes("\\u"); pass += 1) {
    try {
      text = JSON.parse(`"${text.replaceAll('"', '\\"')}"`) as string;
    } catch {
      return text;
    }
  }
  return text;
}

/**
 * Queues an effect, allowing at most one reply and one reaction per message.
 * Returns null when queued, or the reason it was rejected.
 */
export function queueReply(effects: Effect[], text: string): string | null {
  if (effects.some((effect) => effect.kind === "reply")) return "Already responded to this message.";
  const trimmed = unescape(text.trim());
  if (!trimmed) return "Empty reply ignored.";
  effects.push({ kind: "reply", text: trimmed.slice(0, 2000) });
  return null;
}

export function queueReaction(effects: Effect[], emoji: string): string | null {
  if (effects.some((effect) => effect.kind === "react")) return "Already reacted to this message.";
  const trimmed = emoji.trim();
  if (!trimmed || [...trimmed].length > 2) return "Reaction ignored.";
  effects.push({ kind: "react", emoji: trimmed });
  return null;
}

/** Executes queued Discord writes, falling back to plain model text when needed. */
export async function deliver(
  message: Message,
  effects: Effect[],
  modelText: string,
  imageRequested: boolean,
): Promise<{ sent: boolean; fallback: boolean }> {
  const fallback = !effects.some((effect) => effect.kind === "reply") && Boolean(modelText.trim());
  if (fallback) effects.push({ kind: "reply", text: modelText.trim().slice(0, 2000) });

  for (const effect of effects) {
    try {
      if (effect.kind === "reply") {
        await message.reply(effect.text);
        console.log(`[sent] #${message.channelId} message ${message.id} text${fallback ? " (fallback)" : ""}`);
      } else {
        await message.react(effect.emoji);
        console.log(`[react] #${message.channelId} message ${message.id} ${effect.emoji}`);
      }
    } catch (error) {
      console.error(`[deliver] #${message.channelId} message ${message.id} ${effect.kind} failed`, error);
    }
  }

  const sent = effects.some((effect) => effect.kind === "reply");
  const reacted = effects.some((effect) => effect.kind === "react");
  if (!sent && !reacted && !imageRequested) console.log(`[silent] #${message.channelId} message ${message.id}`);
  return { sent, fallback };
}
