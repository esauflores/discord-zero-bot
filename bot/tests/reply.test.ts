import type { Message } from "discord.js";
import { beforeAll, expect, it, vi } from "vitest";

vi.stubEnv("GUILD_ID", "");
vi.stubEnv("CHANNEL_IDS", "");

import { execute as onMessageCreate } from "../src/events/messageCreate.ts";

type PiTool = {
  name: string;
  execute: (
    id: string,
    params: Record<string, string>,
  ) => Promise<{ content: { type: string; text?: string; data?: string }[] }>;
};

const mocks = vi.hoisted(() => ({
  recent: vi.fn(),
  search: vi.fn(),
  image: vi.fn(),
  classify: vi.fn(),
  download: vi.fn(),
  session: vi.fn(),
  run: vi.fn(),
  model: vi.fn(),
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
  SettingsManager: { inMemory: () => ({}) },
  SessionManager: { inMemory: () => ({}) },
  createAgentSession: async (options: { customTools: PiTool[]; tools: string[]; model: { id: string } }) => {
    mocks.session(options);
    let answer = "";
    const session = {
      messages: [] as { role: string; stopReason: string; errorMessage?: string }[],
      bindExtensions: vi.fn(),
      prompt: async (text: string, input: { images: unknown[] }) => {
        const result = await mocks.run(options.customTools, text, input, session);
        answer = result?.text ?? "";
        session.messages = [{ role: "assistant", stopReason: "stop" }];
        return result;
      },
      getLastAssistantText: () => answer,
      dispose: vi.fn(),
    };
    return { session };
  },
}));
vi.mock("ai", () => ({
  jsonSchema: (schema: unknown) => schema,
  tool: (definition: unknown) => definition,
}));
vi.mock("@discord-zero-bot/database/messages", () => ({ recent: mocks.recent }));
vi.mock("@discord-zero-bot/database/search", () => ({ searchMemory: mocks.search }));
vi.mock("@discord-zero-bot/storage", () => ({ download: mocks.download }));
vi.mock("@/tools/generate-image/imageGeneration.ts", () => ({ generateImage: mocks.image }));
vi.mock("@/pipeline/record.ts", () => ({ record: vi.fn() }));
vi.mock("@/ai/classify.ts", () => ({ classifyMessage: mocks.classify, cheapModel: "deepseek/deepseek-v4.1-flash" }));
vi.mock("@/pipeline/record.ts", () => ({ record: vi.fn() }));

const call = (tools: PiTool[], name: string, params: Record<string, string>) => {
  const tool = tools.find((item) => item.name === name);
  if (!tool) throw new Error(`Missing Pi tool ${name}`);
  return tool.execute("call-1", params);
};

beforeAll(() => {
  process.env.AI_API_KEY = "test";
  mocks.classify.mockResolvedValue({ addressed: true, model: "qwen/qwen3.7-flash" });
  mocks.download.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
});

it("reads related history and starts image generation without blocking a text reply", async () => {
  const sent = vi.fn();
  const message = {
    channelId: "channel",
    author: { username: "user" },
    content: "draw a cat",
    client: { user: { id: "bot" } },
    mentions: { has: () => true },
    attachments: new Map(),
    reply: sent,
  } as unknown as Message;
  mocks.recent.mockResolvedValue([
    {
      author_name: "user",
      content: "draw a cat",
      created_at: new Date(0),
      discord_message: {
        attachments: [{ filename: "cat.png", content_type: "image/png", size: 42, storage_key: "private/recent" }],
      },
    },
  ]);
  mocks.search.mockResolvedValue([
    {
      author_name: "friend",
      content: "cats",
      created_at: new Date(0),
      discord_message: {
        attachments: [
          { filename: "notes.pdf", content_type: "application/pdf", size: 128, storage_key: "private/old" },
        ],
      },
    },
  ]);
  let finishImage!: (image: Buffer) => void;
  mocks.image.mockImplementation(() => new Promise<Buffer>((resolve) => (finishImage = resolve)));
  mocks.run.mockImplementationOnce(async (tools: PiTool[], text: string) => {
    expect(text).toContain("Latest 10 messages for context:");
    expect(text).toContain("Directed at you: yes");
    const history = await call(tools, "read_chat", { query: "cat" });
    expect(history.content[0]?.text).toContain("friend: cats");
    expect(history.content[0]?.text).toContain("cat.png (image/png, 42 bytes)");
    expect(history.content[0]?.text).toContain("notes.pdf (application/pdf, 128 bytes)");
    expect(history.content[0]?.text).not.toContain("private/");
    await call(tools, "generate_image", { prompt: "cat" });
    await call(tools, "respond_in_discord", { text: "Working on it" });
    return { text: "unnecessary followup" };
  });

  expect(await onMessageCreate(message)).toBeUndefined();
  expect(mocks.session.mock.lastCall?.[0].tools).toEqual([
    "respond_in_discord",
    "read_chat",
    "open_attachment",
    "react",
    "generate_image",
    "web_search",
  ]);
  expect(mocks.model).toHaveBeenCalledWith("openrouter", "qwen/qwen3.7-flash");
  expect(mocks.recent).toHaveBeenCalledWith("channel", 11);
  expect(mocks.search).toHaveBeenCalledWith("channel", "cat");
  expect(mocks.image).toHaveBeenCalledWith("cat");
  expect(sent).toHaveBeenCalledTimes(1);
  expect(sent).toHaveBeenCalledWith("Working on it");
  finishImage(Buffer.from("png"));
  await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(2));
  expect(sent).toHaveBeenCalledWith({ files: [{ attachment: Buffer.from("png"), name: "generated.png" }] });
});

it("does not call Pi when Jev says the bot was not addressed", async () => {
  mocks.recent.mockResolvedValue([
    { discord_id: "current", author_name: "user", content: "hello" },
    { discord_id: "prior", author_name: "friend", content: "hi" },
  ]);
  mocks.classify.mockResolvedValueOnce({ addressed: false, model: "qwen/qwen3.7-flash" });
  mocks.session.mockClear();
  await onMessageCreate({
    id: "current",
    guildId: "guild",
    channelId: "channel",
    author: { id: "user", username: "user", bot: false },
    client: { user: { id: "bot" } },
    content: "hello",
    attachments: new Map(),
  } as unknown as Message);
  expect(mocks.classify).toHaveBeenCalledWith(expect.objectContaining({ id: "current" }), [
    expect.objectContaining({ discord_id: "prior" }),
  ]);
  expect(mocks.session).not.toHaveBeenCalled();
});

it("publishes Pi text only if it never calls respond_in_discord", async () => {
  const sent = vi.fn();
  const message = {
    channelId: "channel",
    author: { username: "user" },
    content: "hello",
    client: { user: { id: "bot" } },
    mentions: { has: () => false },
    attachments: new Map(),
    reply: sent,
  } as unknown as Message;
  mocks.recent.mockResolvedValue([]);
  mocks.run.mockResolvedValueOnce({ text: "qué ondas maje" });
  await onMessageCreate(message);
  expect(sent).toHaveBeenCalledOnce();
  expect(sent).toHaveBeenCalledWith("qué ondas maje");

  sent.mockClear();
  mocks.run.mockImplementationOnce(async (tools: PiTool[]) => {
    await call(tools, "respond_in_discord", { text: "hi" });
    return { text: "not posted" };
  });
  await onMessageCreate(message);
  expect(sent).toHaveBeenCalledOnce();
  expect(sent).toHaveBeenCalledWith("hi");
});

it("lets Pi react to the current message", async () => {
  mocks.classify.mockResolvedValueOnce({ addressed: true, model: "qwen/qwen3.7-flash" });
  mocks.recent.mockResolvedValue([]);
  const reacted: string[] = [];
  const message = {
    id: "current",
    channelId: "channel",
    author: { username: "user" },
    content: "mira esto",
    attachments: new Map(),
    react: (emoji: string) => void reacted.push(emoji),
  } as unknown as Message;
  mocks.run.mockImplementationOnce(async (tools: PiTool[]) => {
    await call(tools, "react", { emoji: "😂" });
    await call(tools, "react", { emoji: "❤️" });
    return { text: "" };
  });
  await onMessageCreate(message);
  expect(reacted).toEqual(["😂"]);
});

it("uses the routed model and extracts PDF text for Pi", async () => {
  mocks.classify.mockResolvedValueOnce({ addressed: true, model: "deepseek/deepseek-v4.1-flash" });
  mocks.recent.mockResolvedValue([
    {
      discord_id: "old",
      created_at: new Date(0),
      author_name: "friend",
      content: "apuntes",
      discord_message: {
        attachments: [
          {
            filename: "apuntes.pdf",
            content_type: "application/pdf; charset=utf-8",
            size: 9,
            storage_key: "g/c/old/1",
          },
        ],
      },
    },
  ]);
  const message = {
    id: "current",
    channelId: "channel",
    author: { username: "user" },
    content: "qué dice el pdf",
    attachments: new Map(),
  } as unknown as Message;
  mocks.run.mockImplementationOnce(async (tools: PiTool[]) => {
    const result = await call(tools, "open_attachment", { name: "apuntes" });
    expect(mocks.download).toHaveBeenCalledWith("g/c/old/1");
    expect(result.content[0]?.text).toContain("apuntes.pdf (application/pdf, 3 bytes):");
    expect(result.content[1]?.text).toContain("could not extract PDF text");
    return { text: "" };
  });
  await onMessageCreate(message);
  expect(mocks.model).toHaveBeenCalledWith("openrouter", "deepseek/deepseek-v4.1-flash");
});

it("refuses a seventh Pi tool call", async () => {
  mocks.recent.mockResolvedValue([]);
  const message = {
    channelId: "channel",
    author: { username: "user" },
    content: "hi",
    attachments: new Map(),
  } as unknown as Message;
  mocks.run.mockImplementationOnce(async (tools: PiTool[]) => {
    for (let i = 0; i < 6; i++) await call(tools, "respond_in_discord", { text: "hi" });
    await expect(call(tools, "respond_in_discord", { text: "seventh" })).rejects.toThrow("tool-call limit");
    return { text: "" };
  });
  await expect(onMessageCreate(message)).rejects.toThrow("tool-call limit");
});
