import { expect, it } from "vitest";

import { queueReaction, queueReply, type Effect } from "@/pipeline/effects.ts";

it("allows one reply and one reaction, rejecting the extras", () => {
  const effects: Effect[] = [];
  expect(queueReply(effects, "  hola maje  ")).toBeNull();
  expect(effects).toEqual([{ kind: "reply", text: "hola maje" }]);
  // A second reply is refused, so a multi-step model cannot post twice.
  expect(queueReply(effects, "otra vez")).toBe("Already responded to this message.");
  expect(effects).toHaveLength(1);

  expect(queueReaction(effects, "😂")).toBeNull();
  expect(queueReaction(effects, "❤️")).toBe("Already reacted to this message.");
  expect(effects).toEqual([
    { kind: "reply", text: "hola maje" },
    { kind: "react", emoji: "😂" },
  ]);
});

it("unescapes JSON unicode a model leaks into its own reply text", () => {
  const effects: Effect[] = [];
  queueReply(effects, "¿Te convenci\\u00f3 el chucho? \\ud83d\\ude0b");
  expect(effects).toEqual([{ kind: "reply", text: "¿Te convenció el chucho? 😋" }]);

  const twice: Effect[] = [];
  queueReply(twice, "convenci\\\\u00f3");
  expect(twice).toEqual([{ kind: "reply", text: "convenció" }]);
});

it("leaves ordinary text, real backslashes, and non-escapes alone", () => {
  const effects: Effect[] = [];
  queueReply(effects, "ruta C:\\users\\nacho y el \\unicornio");
  expect(effects).toEqual([{ kind: "reply", text: "ruta C:\\users\\nacho y el \\unicornio" }]);
});

it("ignores empty text and non-emoji reactions, and caps reply length", () => {
  const effects: Effect[] = [];
  expect(queueReply(effects, "   ")).toBe("Empty reply ignored.");
  expect(queueReaction(effects, "")).toBe("Reaction ignored.");
  // More than a couple of code points is prose, not a reaction.
  expect(queueReaction(effects, "ja ja ja")).toBe("Reaction ignored.");
  expect(effects).toHaveLength(0);

  queueReply(effects, "x".repeat(2500));
  const reply = effects[0];
  expect(reply?.kind === "reply" && reply.text).toHaveLength(2000);
});
