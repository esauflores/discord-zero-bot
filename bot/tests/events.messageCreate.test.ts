import type { Message } from "discord.js";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ record: vi.fn(), reply: vi.fn() }));
vi.mock("../src/archive/record.ts", () => ({ record: mocks.record }));
vi.mock("../src/pipeline/index.ts", () => ({ runChat: mocks.reply }));

it("lets the model decide whether to respond to an ordinary channel message", async () => {
  vi.stubEnv("GUILD_ID", "");
  vi.stubEnv("CHANNEL_IDS", "");
  const { execute } = await import("../src/events/messageCreate.ts");
  const message = {
    guildId: "guild",
    channelId: "channel",
    author: { bot: false, username: "user" },
    content: "hello everyone",
    client: { user: { id: "bot" } },
    mentions: { has: () => false },
    reference: null,
  } as unknown as Message;
  await execute(message);
  expect(mocks.record).toHaveBeenCalledWith(message);
  expect(mocks.reply).toHaveBeenCalledWith(message, expect.any(Number));
  vi.unstubAllEnvs();
});

it("records the bot's own messages but never responds to bot messages", async () => {
  const { execute } = await import("../src/events/messageCreate.ts");
  mocks.record.mockClear();
  mocks.reply.mockClear();
  const own = {
    guildId: "guild",
    channelId: "channel",
    author: { id: "bot", bot: true, username: "zero-bot" },
    client: { user: { id: "bot" } },
    content: "Forex is trading currencies.",
  } as unknown as Message;
  await execute(own);
  expect(mocks.record).toHaveBeenCalledExactlyOnceWith(own);
  expect(mocks.reply).not.toHaveBeenCalled();
  await execute({ ...own, author: { id: "other", bot: true, username: "another bot" } } as Message);
  expect(mocks.record).toHaveBeenCalledTimes(1);
});
