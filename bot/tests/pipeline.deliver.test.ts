import { expect, it, vi } from "vitest";

import { deliver, type Effect } from "@/pipeline/effects.ts";

function setup() {
  const reply = vi.fn().mockResolvedValue(undefined);
  const react = vi.fn().mockResolvedValue(undefined);
  const message = { id: "message", channelId: "channel", reply, react } as never;
  return { message, reply, react };
}

it("publishes the model text when no reply effect was queued", async () => {
  const { message, reply } = setup();
  const result = await deliver(message, [], "  qué ondas maje  ", false);
  expect(reply).toHaveBeenCalledExactlyOnceWith("qué ondas maje");
  expect(result).toEqual({ sent: true, fallback: true });
});

it("sends a queued reply and does not mark it as a fallback", async () => {
  const { message, reply } = setup();
  const effects: Effect[] = [{ kind: "reply", text: "hola" }];
  const result = await deliver(message, effects, "texto que no debe enviarse", false);
  expect(reply).toHaveBeenCalledExactlyOnceWith("hola");
  expect(result.fallback).toBe(false);
});

it("counts a reaction as activity instead of logging the message as silent", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const { message, react } = setup();
    const result = await deliver(message, [{ kind: "react", emoji: "😂" }], "", false);
    expect(react).toHaveBeenCalledExactlyOnceWith("😂");
    expect(result.sent).toBe(false);
    expect(log.mock.calls.map(([line]) => String(line)).join("\n")).not.toContain("[silent]");
  } finally {
    log.mockRestore();
  }
});

it("logs a silent message when the model neither spoke nor reacted", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const { message } = setup();
    await deliver(message, [], "", false);
    expect(log.mock.calls.map(([line]) => String(line))).toContainEqual("[silent] #channel message message");
  } finally {
    log.mockRestore();
  }
});

it("keeps going when one effect fails", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const { message, reply, react } = setup();
    react.mockRejectedValue(new Error("reaction not allowed"));
    const result = await deliver(
      message,
      [
        { kind: "react", emoji: "😂" },
        { kind: "reply", text: "igual respondo" },
      ],
      "",
      false,
    );
    expect(reply).toHaveBeenCalledExactlyOnceWith("igual respondo");
    expect(result.sent).toBe(true);
    expect(error).toHaveBeenCalled();
  } finally {
    error.mockRestore();
  }
});
