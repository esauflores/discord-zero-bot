import type { Message } from "discord.js";
import { afterEach, expect, it, vi } from "vitest";

import { classifyMessage } from "../src/classify.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("sends the previous 10 messages to Jev's decisions endpoint and gates by its answer", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubEnv("AI_API_KEY", "test-key");
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ answers: { addressed: { noul: 0.9 }, needs_smart_model: { noul: 0.2 } } }),
  });
  vi.stubGlobal("fetch", fetcher);
  const message = {
    id: "current",
    channelId: "channel",
    author: { username: "user" },
    content: "Zerotillo, are you there?",
    client: { user: { id: "bot" } },
    mentions: { has: () => false },
    attachments: new Map(),
  } as unknown as Message;
  const previous = Array.from({ length: 10 }, (_, i) => ({
    author_name: i === 9 ? "zero-bot" : "friend",
    content: i === 9 ? "Forex is trading currencies." : `line ${i}`,
  }));
  expect(await classifyMessage(message, previous)).toEqual({ addressed: true, model: "qwen/qwen3.7-flash" });
  expect(log).toHaveBeenCalledWith("[jev] #channel message current starting model=typesafe/jev-1.13 previous=10");
  expect(log).toHaveBeenCalledWith(
    expect.stringMatching(/answered addressed=0\.90 smart=0\.20 respond=true model=qwen\/qwen3\.7-flash ms=\d+/),
  );
  const [url, options] = fetcher.mock.calls[0];
  expect(url.toString()).toBe("https://openrouter.ai/api/alpha/decisions");
  expect(options.headers.Authorization).toBe("Bearer test-key");
  const body = JSON.parse(options.body);
  expect(body.model).toBe("typesafe/jev-1.13");
  expect(body.state.previous_messages).toHaveLength(10);
  expect(body.state.previous_messages[9]).toEqual({ author: "zero-bot", text: "Forex is trading currencies." });
  expect(body.state.current_message.text).toBe(message.content);
  expect(body.questions.needs_smart_model.type).toBe("noul");
  fetcher.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ answers: { addressed: { noul: 0.1 }, needs_smart_model: { noul: 0.9 } } }),
  });
  expect(await classifyMessage(message, previous)).toEqual({ addressed: false, model: "deepseek/deepseek-v4.1-flash" });
  expect(log).toHaveBeenCalledWith(
    expect.stringMatching(
      /answered addressed=0\.10 smart=0\.90 respond=false model=deepseek\/deepseek-v4\.1-flash ms=\d+/,
    ),
  );
  fetcher.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ answers: { addressed: { noul: 0.1 }, needs_smart_model: { noul: 0.9 } } }),
  });
  expect(await classifyMessage({ ...message, mentions: { has: () => true } } as unknown as Message, previous)).toEqual({
    addressed: true,
    model: "deepseek/deepseek-v4.1-flash",
  });
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("keeps direct pings and names working when Jev is unavailable", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("AI_API_KEY", "test-key");
  const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetcher);
  const message = {
    id: "current",
    channelId: "channel",
    author: { username: "user" },
    content: "Hey zero-bot",
    client: { user: { id: "bot" } },
    mentions: { has: () => false },
    attachments: new Map(),
  } as unknown as Message;
  expect(await classifyMessage(message, [])).toEqual({ addressed: true, model: "deepseek/deepseek-v4.1-flash" });
  expect(error).toHaveBeenCalledWith(
    expect.stringMatching(/failed fallback=true model=deepseek\/deepseek-v4\.1-flash ms=\d+/),
    expect.any(Error),
  );
  expect(await classifyMessage({ ...message, content: "subzero" } as Message, [])).toEqual({
    addressed: false,
    model: "deepseek/deepseek-v4.1-flash",
  });
  expect(error).toHaveBeenCalledWith(
    expect.stringMatching(/failed fallback=false model=deepseek\/deepseek-v4\.1-flash ms=\d+/),
    expect.any(Error),
  );
  expect(
    await classifyMessage({ ...message, content: "hello", mentions: { has: () => true } } as unknown as Message, []),
  ).toEqual({ addressed: true, model: "deepseek/deepseek-v4.1-flash" });
  expect(error.mock.calls[0]?.[1]).toEqual(new Error("offline"));
  expect(fetcher).toHaveBeenCalledTimes(3);
});
