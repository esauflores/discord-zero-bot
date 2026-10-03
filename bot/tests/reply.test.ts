import type { Message } from "discord.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { runChat as onMessageCreate } from "@/pipeline/index.ts";

type PiTool = {
  name: string;
  execute: (
    id: string,
    params: Record<string, string>,
    signal?: AbortSignal,
  ) => Promise<{ content: { text?: string }[] }>;
};
const mocks = vi.hoisted(() => ({
  recent: vi.fn(),
  search: vi.fn(),
  classify: vi.fn(),
  record: vi.fn(),
  session: vi.fn(),
  run: vi.fn(),
  model: vi.fn(),
  abort: vi.fn(),
  dispose: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("@earendil-works/pi-coding-agent", () => ({
  ModelRuntime: {
    create: () =>
      Promise.resolve({
        setRuntimeApiKey: vi.fn(),
        getModel: (provider: string, id: string) => {
          mocks.model(provider, id);
          return { id };
        },
      }),
  },
  DefaultResourceLoader: class {
    reload = vi.fn();
  },
  SettingsManager: {
    inMemory: (settings: unknown) => {
      mocks.settings(settings);
      return {};
    },
  },
  SessionManager: { inMemory: () => ({}) },
  createAgentSession: async (options: {
    customTools: PiTool[];
    tools: string[];
    model: { id: string };
    resourceLoader: unknown;
  }) => {
    mocks.session(options);
    const session = {
      messages: [{ role: "assistant", stopReason: "stop" }] as {
        role: string;
        stopReason: string;
        errorMessage?: string;
      }[],
      bindExtensions: vi.fn(),
      prompt: (text: string, input: unknown) => mocks.run(options.customTools, text, input, session),
      abort: mocks.abort,
      dispose: mocks.dispose,
    };
    return { session };
  },
}));
vi.mock("@/infra/database.ts", () => ({ recent: mocks.recent, searchMemory: mocks.search }));
vi.mock("@/pipeline/record.ts", () => ({ record: mocks.record }));
vi.mock("@/pipeline/classify.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/pipeline/classify.ts")>()),
  classifyMessage: mocks.classify,
}));

const call = (tools: PiTool[], name: string, params: Record<string, string>) => {
  const tool = tools.find((item) => item.name === name);
  if (!tool) throw new Error(`Missing Pi tool ${name}`);
  return tool.execute("call-1", params);
};
function message(
  overrides: Partial<Pick<Message, "content" | "attachments" | "guildId" | "channelId" | "author">> = {},
): Message {
  return {
    id: "current",
    guildId: "guild",
    channelId: "channel",
    author: { id: "user", username: "user", bot: false },
    client: { user: { id: "bot" } },
    content: "hello",
    attachments: new Map(),
    reply: vi.fn().mockResolvedValue(undefined),
    react: vi.fn().mockResolvedValue(undefined),
    channel: { sendTyping: vi.fn().mockResolvedValue(undefined) },
    ...overrides,
  } as unknown as Message;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GUILD_ID", "");
  vi.stubEnv("CHANNEL_IDS", "");
  vi.stubEnv("AI_API_KEY", "test");
  mocks.classify.mockResolvedValue(true);
  mocks.recent.mockResolvedValue([]);
  mocks.search.mockResolvedValue([]);
  mocks.run.mockReset().mockResolvedValue(undefined);
  mocks.abort.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

it("reads metadata and starts an image without blocking the queued text reply", async () => {
  const msg = message({ content: "draw a cat" });
  mocks.recent.mockResolvedValue([
    {
      discord_id: "old",
      author_name: "friend",
      content: "cats",
      created_at: new Date(0),
      discord_message: { attachments: [{ filename: "cat.png", content_type: "image/png", size: 42 }] },
    },
  ]);
  mocks.search.mockResolvedValue([
    {
      discord_id: "older",
      author_name: "friend",
      content: "notes",
      created_at: new Date(0),
      discord_message: { attachments: [{ filename: "notes.pdf", content_type: "application/pdf", size: 128 }] },
    },
  ]);
  let finishImage!: (response: Response) => void;
  const fetcher = vi.fn().mockReturnValue(
    new Promise<Response>((resolve) => {
      finishImage = resolve;
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  mocks.run.mockImplementationOnce(async (tools: PiTool[], text: string) => {
    expect(text).toContain("Latest 10 messages for context:");
    const history = await call(tools, "read_chat", { query: "cat" });
    expect(history.content[0]?.text).toContain("friend: notes");
    expect(history.content[0]?.text).toContain("cat.png (image/png, 42 bytes)");
    expect(history.content[0]?.text).toContain("notes.pdf (application/pdf, 128 bytes)");
    await call(tools, "generate_image", { prompt: "cat" });
    await call(tools, "respond_in_discord", { text: "Working on it" });
  });
  await onMessageCreate(msg);
  expect(mocks.session.mock.lastCall?.[0].tools).toEqual([
    "respond_in_discord",
    "read_chat",
    "react",
    "generate_image",
    "web_search",
  ]);
  expect(mocks.model).toHaveBeenCalledWith("openrouter", "deepseek/deepseek-v4.1-flash");
  expect(mocks.search).toHaveBeenCalledWith("channel", "cat");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ prompt: "cat" });
  expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  expect(msg.reply).toHaveBeenCalledExactlyOnceWith("Working on it");
  finishImage(new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("png").toString("base64") }] })));
  await vi.waitFor(() => expect(msg.reply).toHaveBeenCalledTimes(2));
  expect(msg.reply).toHaveBeenCalledWith({ files: [{ attachment: Buffer.from("png"), name: "generated.png" }] });
});

it("excludes the current message from classifier context and skips unaddressed messages", async () => {
  const previous = Array.from({ length: 10 }, (_, i) => ({
    discord_id: `prior-${i}`,
    author_name: "friend",
    content: `line ${i}`,
  }));
  mocks.recent.mockResolvedValue([{ discord_id: "current", content: "hello" }, ...previous]);
  mocks.classify.mockResolvedValueOnce(false);
  await onMessageCreate(message());
  expect(mocks.record).toHaveBeenCalledOnce();
  expect(mocks.classify).toHaveBeenCalledWith(expect.objectContaining({ id: "current" }), previous.slice().reverse());
  expect(mocks.session).not.toHaveBeenCalled();
});

it("never posts final model text, but does publish explicit reply tools", async () => {
  const msg = message();
  mocks.run.mockResolvedValueOnce({ text: "not posted" });
  await onMessageCreate(msg);
  expect(msg.reply).not.toHaveBeenCalled();
  mocks.run.mockImplementationOnce(async (tools: PiTool[]) => {
    await call(tools, "respond_in_discord", { text: "hi" });
    return { text: "also not posted" };
  });
  await onMessageCreate(msg);
  expect(msg.reply).toHaveBeenCalledExactlyOnceWith("hi");
});

it("logs completion metadata without exposing final text", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  mocks.run.mockImplementationOnce(async (_tools: PiTool[], _text: string, _input: unknown, session) => {
    session.messages = [{ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "private answer" }] }];
  });
  const msg = message();
  await onMessageCreate(msg);
  expect(log).toHaveBeenCalledWith(
    "[pi] #channel message current stop=stop toolCalls=0 finalText=true effects=0 imageRequested=false",
  );
  expect(JSON.stringify(log.mock.calls)).not.toContain("private answer");
  expect(msg.reply).not.toHaveBeenCalled();
});

it("allows a reaction-only response without publishing final text", async () => {
  const msg = message();
  mocks.run.mockImplementationOnce(async (tools: PiTool[]) => {
    await call(tools, "react", { emoji: "😂" });
    await call(tools, "react", { emoji: "❤️" });
    return { text: "not posted" };
  });
  await onMessageCreate(msg);
  expect(msg.react).toHaveBeenCalledExactlyOnceWith("😂");
  expect(msg.reply).not.toHaveBeenCalled();
});

it("describes current attachments as metadata without downloading them", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const msg = message({
    attachments: new Map([["file", { name: "notes.pdf", contentType: "application/pdf", size: 9 }]]) as never,
  });
  await onMessageCreate(msg);
  expect(mocks.run.mock.lastCall?.[1]).toContain(
    "Attachment metadata (see attachment input status for content availability): notes.pdf (application/pdf, 9 bytes)",
  );
  expect(mocks.run.mock.lastCall?.[2]).toEqual({ expandPromptTemplates: false });
  expect(fetcher).not.toHaveBeenCalled();
});

it("does not store or classify messages outside the configured scope", async () => {
  vi.stubEnv("GUILD_ID", "allowed");
  vi.stubEnv("CHANNEL_IDS", " permitted , second ");
  await onMessageCreate(message({ guildId: "other", channelId: "permitted" }));
  await onMessageCreate(message({ guildId: "allowed", channelId: "other" }));
  await onMessageCreate(message({ guildId: null }));
  expect(mocks.record).not.toHaveBeenCalled();
  expect(mocks.classify).not.toHaveBeenCalled();
  await onMessageCreate(message({ guildId: "allowed", channelId: "permitted" }));
  expect(mocks.record).toHaveBeenCalledOnce();
  expect(mocks.classify).toHaveBeenCalledOnce();
});

it("records its own replies but ignores other bots before storage", async () => {
  await onMessageCreate(message({ author: { id: "other-bot", bot: true } as never }));
  expect(mocks.record).not.toHaveBeenCalled();
  await onMessageCreate(message({ author: { id: "bot", username: "Zero", bot: true } as never }));
  expect(mocks.record).toHaveBeenCalledOnce();
  expect(mocks.classify).not.toHaveBeenCalled();
});

it("refuses a thirty-first tool call and disposes the session without delivery", async () => {
  const msg = message();
  mocks.run.mockImplementationOnce(async (tools: PiTool[]) => {
    for (let i = 0; i < 30; i++) await call(tools, "respond_in_discord", { text: "hi" });
    expect(() => call(tools, "respond_in_discord", { text: "thirty-first" })).toThrow("tool-call limit");
  });
  await expect(onMessageCreate(msg)).rejects.toThrow("tool-call limit");
  expect(mocks.dispose).toHaveBeenCalledOnce();
  expect(msg.reply).not.toHaveBeenCalled();
});

it("aborts a response after its deadline and disposes the session", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  mocks.run.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const operation = onMessageCreate(message());
  const rejected = expect(operation).rejects.toThrow("Pi response timed out (120s)");
  await vi.advanceTimersByTimeAsync(120_000);
  expect(mocks.abort).toHaveBeenCalledOnce();
  finish();
  await rejected;
  expect(mocks.settings).toHaveBeenCalledWith({ httpIdleTimeoutMs: 30_000, retry: { enabled: false } });
  expect(mocks.dispose).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
