import type { Message } from "discord.js";

/**
 * Something a capability wants to happen in Discord. Tools record these instead of
 * writing directly, so `deliver` de-duplicates text replies and reactions.
 * Background image tasks send their own result when ready.
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
  if (!trimmed) return "Reaction ignored.";
  effects.push({ kind: "react", emoji: trimmed });
  return null;
}

/**
 * Shows the Discord "typing…" indicator while the bot works, and keeps it alive until
 * the returned stop is called (Discord drops it after ~10s, so it refreshes).
 */
export function showTyping(message: Message): () => void {
  const channel = message.channel;
  if (!("sendTyping" in channel)) return () => {}; // PartialGroupDMChannel has no typing indicator
  channel.sendTyping().catch(() => {});
  const timer = setInterval(() => void channel.sendTyping().catch(() => {}), 8_000);
  return () => clearInterval(timer);
}

/** Publishes only queued effects, never the agent's final text. */
export async function deliver(
  message: Message,
  effects: Effect[],
  imageRequested: boolean,
): Promise<{ sent: boolean }> {
  let sent = false;
  let reacted = false;

  for (const effect of effects) {
    try {
      if (effect.kind === "reply") {
        await message.reply(effect.text);
        sent = true;
        console.log(`[sent] #${message.channelId} message ${message.id} text`);
      } else {
        await message.react(effect.emoji);
        reacted = true;
        console.log(`[react] #${message.channelId} message ${message.id} ${effect.emoji}`);
      }
    } catch (error) {
      console.error(`[deliver] #${message.channelId} message ${message.id} ${effect.kind} failed`, error);
    }
  }

  if (!sent && !reacted && !imageRequested) console.log(`[silent] #${message.channelId} message ${message.id}`);
  return { sent };
}
