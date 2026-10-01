import type { Message } from "discord.js";
import { beforeAll, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recent: vi.fn(),
  search: vi.fn(),
  image: vi.fn(),
  generate: vi.fn(),
  classify: vi.fn(),
  download: vi.fn(),
}));

vi.mock("@ai-sdk/openai-compatible", () => ({ createOpenAICompatible: () => (id: string) => ({ id }) }));
vi.mock("ai", () => ({
  generateText: mocks.generate,
  jsonSchema: (schema: unknown) => schema,
  tool: (definition: unknown) => definition,
  stepCountIs: () => () => true,
}));
vi.mock("@discord-zero-bot/database/messages", () => ({ recent: mocks.recent }));
vi.mock("@discord-zero-bot/database/search", () => ({ searchMemory: mocks.search }));
vi.mock("@discord-zero-bot/storage", () => ({ download: mocks.download }));
vi.mock("../src/tools/generate-image/imageGeneration.ts", () => ({ generateImage: mocks.image }));
// The persist stage is covered by pipeline.record.test.ts; here it is stubbed so
// these tests exercise the answering chain without database or storage.
vi.mock("../src/pipeline/record.ts", () => ({ record: vi.fn() }));
vi.mock("../src/ai/classify.ts", () => ({ classifyMessage: mocks.classify, cheapModel: "qwen/qwen3.7-flash" }));

beforeAll(() => {
  process.env.AI_API_KEY = "test";
  mocks.classify.mockResolvedValue({ addressed: true, model: "qwen/qwen3.7-flash" });
  mocks.download.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
});

it("reads related history and starts image generation without blocking a text reply", async () => {
  const { runChat: reply } = await import("../src/pipeline/index.ts");
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
  mocks.generate.mockImplementationOnce(async ({ tools, messages, model }) => {
    expect(model.id).toBe("qwen/qwen3.7-flash");
    expect(messages[0].content[0].text).toContain("Latest 10 messages for context:");
    expect(messages[0].content[0].text).toContain("Directed at you: yes");
    const history = await tools.read_chat.execute({ query: "cat" });
    expect(history).toContain("friend: cats");
    expect(history).toContain("cat.png (image/png, 42 bytes)");
    expect(history).toContain("notes.pdf (application/pdf, 128 bytes)");
    expect(history).not.toContain("private/");
    await tools.generate_image.execute({ prompt: "cat" });
    await tools.respond_in_discord.execute({ text: "Working on it" });
    return { text: "unnecessary followup" };
  });

  expect(await reply(message)).toBeUndefined();
  expect(mocks.recent).toHaveBeenCalledWith("channel", 11);
  expect(mocks.search).toHaveBeenCalledWith("channel", "cat");
  expect(mocks.image).toHaveBeenCalledWith("cat");
  expect(sent).toHaveBeenCalledTimes(1);
  expect(sent).toHaveBeenCalledWith("Working on it");
  finishImage(Buffer.from("png"));
  await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(2));
  expect(sent).toHaveBeenCalledWith({ files: [{ attachment: Buffer.from("png"), name: "generated.png" }] });
});

it("does not call the answer model when Jev says the bot was not addressed", async () => {
  const { runChat: reply } = await import("../src/pipeline/index.ts");
  mocks.recent.mockResolvedValue([
    { discord_id: "current", author_name: "user", content: "hello" },
    { discord_id: "prior", author_name: "friend", content: "hi" },
  ]);
  mocks.classify.mockResolvedValueOnce({ addressed: false, model: "qwen/qwen3.7-flash" });
  mocks.generate.mockClear();
  await reply({ id: "current", channelId: "channel" } as Message);
  expect(mocks.classify).toHaveBeenCalledWith(expect.objectContaining({ id: "current" }), [
    expect.objectContaining({ discord_id: "prior" }),
  ]);
  expect(mocks.generate).not.toHaveBeenCalled();
});

it("publishes the model's text when it never calls respond_in_discord", async () => {
  const { runChat: reply } = await import("../src/pipeline/index.ts");
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
  // Jev already decided the message is addressed, so text answered without the
  // tool must still be published instead of silently dropped.
  mocks.generate.mockResolvedValueOnce({ text: "qué ondas maje", steps: [] });
  await reply(message);
  expect(sent).toHaveBeenCalledOnce();
  expect(sent).toHaveBeenCalledWith("qué ondas maje");

  sent.mockClear();
  mocks.generate.mockImplementationOnce(async ({ tools }) => {
    await tools.respond_in_discord.execute({ text: "hi" });
    return { text: "not posted", steps: [] };
  });
  await reply(message);
  expect(sent).toHaveBeenCalledOnce();
  expect(sent).toHaveBeenCalledWith("hi");
});

it("lets the model react to the current message", async () => {
  const { runChat: reply } = await import("../src/pipeline/index.ts");
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
  mocks.generate.mockImplementationOnce(async ({ tools }) => {
    await tools.react.execute({ emoji: "😂" });
    await tools.react.execute({ emoji: "❤️" });
    return { text: "" };
  });
  await reply(message);
  expect(reacted).toEqual(["😂"]);
});

it("hands a stored attachment back to the smart model", async () => {
  const { runChat: reply } = await import("../src/pipeline/index.ts");
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
  mocks.generate.mockImplementationOnce(async ({ tools }) => {
    const result = await tools.open_attachment.execute({ name: "apuntes" });
    expect(mocks.download).toHaveBeenCalledWith("g/c/old/1");
    expect(result.parts).toEqual([
      { type: "text", text: "apuntes.pdf (application/pdf, 3 bytes):" },
      {
        type: "file",
        data: { type: "data", data: new Uint8Array([1, 2, 3]) },
        mediaType: "application/pdf",
        filename: "apuntes.pdf",
      },
    ]);
    return { text: "" };
  });
  await reply(message);
  expect(mocks.generate.mock.lastCall?.[0].model.id).toBe("deepseek/deepseek-v4.1-flash");
});
