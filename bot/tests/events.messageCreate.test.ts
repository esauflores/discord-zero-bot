import type { Message } from "discord.js";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runChat: vi.fn() }));
vi.mock("../src/pipeline/index.ts", () => ({ runChat: mocks.runChat }));

it("hands an ordinary channel message to the chain", async () => {
  vi.stubEnv("GUILD_ID", "");
  vi.stubEnv("CHANNEL_IDS", "");
  const { execute } = await import("../src/events/messageCreate.ts");
  const message = {
    guildId: "guild",
    channelId: "channel",
    author: { bot: false, username: "user" },
    content: "hello everyone",
    client: { user: { id: "bot" } },
  } as unknown as Message;
  await execute(message);
  expect(mocks.runChat).toHaveBeenCalledWith(message);
  vi.unstubAllEnvs();
});

it("passes the bot's own messages to the chain but ignores other bots", async () => {
  const { execute } = await import("../src/events/messageCreate.ts");
  mocks.runChat.mockClear();
  const own = {
    guildId: "guild",
    channelId: "channel",
    author: { id: "bot", bot: true, username: "zero-bot" },
    client: { user: { id: "bot" } },
    content: "Forex is trading currencies.",
  } as unknown as Message;
  // Our own reply still enters the chain so it is recorded for context.
  await execute(own);
  expect(mocks.runChat).toHaveBeenCalledExactlyOnceWith(own);

  // Any other bot is dropped before the chain.
  await execute({ ...own, author: { id: "other", bot: true, username: "another bot" } } as Message);
  expect(mocks.runChat).toHaveBeenCalledTimes(1);
});
