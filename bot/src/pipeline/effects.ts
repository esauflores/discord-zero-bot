/**
 * Something a capability wants to happen in Discord. Tools record these instead of
 * writing directly, so `deliver` is the only place that talks to Discord and can
 * de-duplicate what a multi-step model produces.
 */
export type Effect = { kind: "reply"; text: string } | { kind: "react"; emoji: string };

/**
 * Queues an effect, allowing at most one reply and one reaction per message.
 * Returns null when queued, or the reason it was rejected.
 */
export function queueReply(effects: Effect[], text: string): string | null {
  if (effects.some((effect) => effect.kind === "reply")) return "Already responded to this message.";
  const trimmed = text.trim();
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
