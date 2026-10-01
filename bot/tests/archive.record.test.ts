import type { Message } from "discord.js";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ values: vi.fn() }));
vi.mock("@discord-zero-bot/database/messages", () => ({ saveMessage: mocks.values }));

it("archives attachments and keeps message metadata if an upload fails", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response("file bytes", { status: 200 })) // Discord CDN
    .mockResolvedValueOnce(new Response(null, { status: 200 })) // bucket
    .mockResolvedValueOnce(new Response(null, { status: 200 })); // object
  vi.stubGlobal("fetch", fetchMock);
  const { record } = await import("../src/archive/record.ts");
  const msg = {
    id: "message",
    guildId: "guild",
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
        "attachment",
        {
          id: "attachment",
          name: "photo.png",
          size: 10,
          url: "https://cdn.discordapp.com/attachments/photo.png",
          proxyURL: "https://media.discordapp.net/photo.png",
          contentType: "image/png",
          width: 20,
          height: 20,
          description: null,
        },
      ],
    ]),
  } as unknown as Message;
  try {
    await record(msg);
    const row = mocks.values.mock.lastCall?.[0] as { discord_message: { attachments: { storage_key: string }[] } };
    expect(row.discord_message.attachments[0]?.storage_key).toBe("guild/channel/message/attachment");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(new TextDecoder().decode(fetchMock.mock.calls[2]?.[1]?.body)).toBe("file bytes");
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "http://127.0.0.1:8333/discord-attachments/guild/channel/message/attachment",
    );

    fetchMock.mockReset().mockResolvedValueOnce(new Response(null, { status: 404 }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await record(msg);
      const failed = mocks.values.mock.lastCall?.[0] as {
        content: string;
        discord_message: { attachments: { filename: string; storage_key: string | null }[] };
      };
      expect(failed.content).toBe("hello");
      expect(failed.discord_message.attachments[0]).toMatchObject({ filename: "photo.png", storage_key: null });
      expect(log).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  } finally {
    vi.unstubAllGlobals();
  }
});
