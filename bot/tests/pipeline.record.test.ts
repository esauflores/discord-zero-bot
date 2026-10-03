import type { Message } from "discord.js";
import { afterEach, expect, it, vi } from "vitest";

import { record } from "@/pipeline/record.ts";

const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/infra/database.ts", () => ({ saveMessage: mocks.save }));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("records text and attachment metadata without fetching or transcribing files", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const msg = {
    id: "message",
    guild: { id: "guild" },
    channelId: "channel",
    author: { id: "author", username: "user", globalName: null, avatar: null, bot: false },
    content: "hello",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    editedAt: null,
    type: 0,
    pinned: false,
    tts: false,
    flags: { bitfield: 0 },
    mentions: { users: { map: () => [] }, roles: new Map(), everyone: false },
    reference: null,
    embeds: [],
    components: [],
    attachments: new Map([
      [
        "photo",
        {
          id: "photo",
          name: "photo.png",
          size: 10,
          url: "https://cdn.discordapp.com/attachments/photo.png",
          proxyURL: "https://media.discordapp.net/photo.png",
          contentType: "image/png",
          width: 20,
          height: 20,
          description: "a cat",
        },
      ],
      [
        "voice",
        {
          id: "voice",
          name: "voice.ogg",
          size: 12,
          url: "https://cdn.discordapp.com/attachments/voice.ogg",
          proxyURL: "https://media.discordapp.net/voice.ogg",
          contentType: "audio/ogg",
          width: null,
          height: null,
          description: null,
        },
      ],
    ]),
  } as unknown as Message;
  await record(msg);
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      guild_id: "guild",
      channel_id: "channel",
      discord_id: "message",
      author_id: "author",
      content: "hello",
      created_at: msg.createdAt,
      discord_message: expect.objectContaining({
        author: { id: "author", username: "user", global_name: null, avatar: null, bot: false },
        content: "hello",
        timestamp: "2026-01-01T00:00:00.000Z",
        attachments: [
          {
            id: "photo",
            filename: "photo.png",
            size: 10,
            content_type: "image/png",
            width: 20,
            height: 20,
            description: "a cat",
            url: "https://cdn.discordapp.com/attachments/photo.png",
            proxy_url: "https://media.discordapp.net/photo.png",
          },
          {
            id: "voice",
            filename: "voice.ogg",
            size: 12,
            content_type: "audio/ogg",
            width: null,
            height: null,
            description: null,
            url: "https://cdn.discordapp.com/attachments/voice.ogg",
            proxy_url: "https://media.discordapp.net/voice.ogg",
          },
        ],
      }),
    }),
  );
  expect(fetcher).not.toHaveBeenCalled();
});

it("does not persist direct messages", async () => {
  await record({ guild: null } as Message);
  expect(mocks.save).not.toHaveBeenCalled();
});
