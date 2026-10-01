import { expect, it, vi } from "vitest";

import type { ChatContext } from "../src/pipeline/context.ts";
import { deliver } from "../src/pipeline/deliver.ts";

function makeContext(overrides: Partial<ChatContext> = {}): {
  ctx: ChatContext;
  reply: ReturnType<typeof vi.fn>;
  react: ReturnType<typeof vi.fn>;
} {
  const reply = vi.fn().mockResolvedValue(undefined);
  const react = vi.fn().mockResolvedValue(undefined);
  const base = {
    message: { id: "message", channelId: "channel", reply, react },
    receivedAt: Date.now(),
    chat: [],
    addressed: true,
    model: "qwen/qwen3.7-flash",
    state: { imageRequested: false },
    effects: [],
    modelText: "",
    steps: 1,
    promptText: "",
    promptFiles: [],
    sent: false,
    fallback: false,
    halt: false,
    timings: {},
    ...overrides,
  } as unknown as ChatContext;
  return { ctx: base, reply, react };
}

it("publishes the model text when no reply effect was queued", async () => {
  const { ctx, reply } = makeContext({ modelText: "  qué ondas maje  " });
  await deliver(ctx);
  expect(reply).toHaveBeenCalledExactlyOnceWith("qué ondas maje");
  expect(ctx.sent).toBe(true);
  expect(ctx.fallback).toBe(true);
});

it("sends a queued reply and does not mark it as a fallback", async () => {
  const { ctx, reply } = makeContext({
    effects: [{ kind: "reply", text: "hola" }],
    modelText: "texto que no debe enviarse",
  });
  await deliver(ctx);
  expect(reply).toHaveBeenCalledExactlyOnceWith("hola");
  expect(ctx.fallback).toBe(false);
});

it("counts a reaction as activity instead of logging the message as silent", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const { ctx, react } = makeContext({ effects: [{ kind: "react", emoji: "😂" }] });
    await deliver(ctx);
    expect(react).toHaveBeenCalledExactlyOnceWith("😂");
    expect(ctx.sent).toBe(false);
    expect(log.mock.calls.map(([line]) => String(line)).join("\n")).not.toContain("[silent]");
  } finally {
    log.mockRestore();
  }
});

it("logs a silent message when the model neither spoke nor reacted", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const { ctx } = makeContext();
    await deliver(ctx);
    expect(log.mock.calls.map(([line]) => String(line))).toContainEqual("[silent] #channel message message");
  } finally {
    log.mockRestore();
  }
});

it("keeps going when one effect fails", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const { ctx, reply, react } = makeContext({
      effects: [
        { kind: "react", emoji: "😂" },
        { kind: "reply", text: "igual respondo" },
      ],
    });
    react.mockRejectedValue(new Error("reaction not allowed"));
    await deliver(ctx);
    // The failed reaction must not abort the queued reply.
    expect(reply).toHaveBeenCalledExactlyOnceWith("igual respondo");
    expect(ctx.sent).toBe(true);
    expect(error).toHaveBeenCalled();
  } finally {
    error.mockRestore();
  }
});
