import { expect, it, vi } from "vitest";

import { queueReaction, queueReply, showTyping, type Effect } from "@/pipeline/effects.ts";

it("keeps the typing indicator alive until stopped", () => {
  vi.useFakeTimers();
  try {
    const sendTyping = vi.fn().mockResolvedValue(undefined);
    const message = { channel: { sendTyping } } as never;
    const stop = showTyping(message);
    expect(sendTyping).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(24_000);
    expect(sendTyping).toHaveBeenCalledTimes(4);
    stop();
    vi.advanceTimersByTime(24_000);
    expect(sendTyping).toHaveBeenCalledTimes(4);
  } finally {
    vi.useRealTimers();
  }
});

it("fuzzes empty input, length limits and duplicate calls (seed 42)", () => {
  let seed = 42;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  const samples = ["", " ", "x", "😂", "❤️", "👍🏽", "👨‍👩‍👧‍👦", "ja ja ja", "\n\t"];
  const lengths = [0, 1, 2, 1999, 2000, 2001, 3000];
  for (let trial = 0; trial < 200; trial++) {
    const text = samples[random() % samples.length]!.repeat(lengths[random() % lengths.length]!);
    const trimmed = text.trim();
    const expected: Effect[] = [];
    if (trimmed) expected.push({ kind: "reply", text: trimmed.slice(0, 2000) });
    if (trimmed) expected.push({ kind: "react", emoji: trimmed });
    const effects: Effect[] = [];
    queueReply(effects, text);
    queueReaction(effects, text);
    expect(effects, `trial ${trial}`).toEqual(expected);
    queueReply(effects, text);
    queueReaction(effects, text);
    expect(effects, `duplicate calls at trial ${trial}`).toEqual(expected);
  }
});

it("preserves Unicode and backslash regressions", () => {
  for (const [input, output] of [
    ["¿Te convenci\\u00f3 el chucho? \\ud83d\\ude0b", "¿Te convenció el chucho? 😋"],
    ["convenci\\\\u00f3", "convenció"],
    ["ruta C:\\users\\nacho y el \\unicornio", "ruta C:\\users\\nacho y el \\unicornio"],
  ]) {
    const effects: Effect[] = [];
    queueReply(effects, input!);
    expect(effects).toEqual([{ kind: "reply", text: output }]);
  }
});
