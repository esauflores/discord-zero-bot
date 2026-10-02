import type { Message } from "discord.js";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ values: vi.fn(), transcribe: vi.fn() }));
vi.mock("@discord-zero-bot/database", () => ({ saveMessage: mocks.values }));
// `process` calls the module-local `transcribe`, so the mock replaces the
// processor itself. It reuses the real `audioFormat` rather than restating it,
// so the format mapping is exercised instead of duplicated.
vi.mock("@/media/audio.ts", async () => {
  const { audioFormat } = await import("@/media/types.ts");
  return {
    transcribe: mocks.transcribe,
    audioProcessor: {
      name: "transcribe",
      matches: (media: { contentType: string | null }) => media.contentType?.startsWith("audio/") ?? false,
      process: async (media: { bytes: ArrayBuffer; contentType: string | null; name: string }) => ({
        text: await mocks.transcribe(media.bytes, audioFormat(media)),
      }),
    },
  };
});

it("archives attachments and keeps message metadata if an upload fails", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response("file bytes", { status: 200 })) // Discord CDN
    .mockResolvedValueOnce(new Response(null, { status: 200 })) // bucket
    .mockResolvedValueOnce(new Response(null, { status: 200 })); // object
  vi.stubGlobal("fetch", fetchMock);
  const { record } = await import("@/pipeline/record.ts");
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

it("transcribes a voice note into the message content using the on-disk format", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response("opus bytes", { status: 200 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  mocks.transcribe.mockResolvedValue("hola maje, ya llegué");
  const { record } = await import("@/pipeline/record.ts");
  const msg = {
    id: "message",
    guildId: "guild",
    guild: { id: "guild" },
    channelId: "channel",
    author: { id: "author", username: "user", globalName: null, avatar: null, bot: false },
    content: "",
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
          name: "voice-message.ogg",
          size: 10,
          url: "https://cdn.discordapp.com/attachments/voice-message.ogg",
          proxyURL: "https://media.discordapp.net/voice-message.ogg",
          contentType: "audio/ogg",
          width: null,
          height: null,
          description: null,
        },
      ],
    ]),
  } as unknown as Message;
  try {
    await record(msg);
    // Bare container name, not the media type: the STT endpoint rejects "audio/ogg".
    expect(mocks.transcribe).toHaveBeenCalledWith(expect.any(ArrayBuffer), "ogg");
    const row = mocks.values.mock.lastCall?.[0] as {
      content: string;
      discord_message: { attachments: { transcript: string | null }[] };
    };
    expect(row.content).toBe("hola maje, ya llegué");
    expect(row.discord_message.attachments[0]?.transcript).toBe("hola maje, ya llegué");

    // Silence returns an empty transcript, which must not be stored as "".
    mocks.transcribe.mockResolvedValue("");
    fetchMock
      .mockResolvedValueOnce(new Response("opus bytes", { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await record(msg);
    expect(mocks.transcribe).toHaveBeenCalledTimes(2);
    const silent = mocks.values.mock.lastCall?.[0] as {
      content: string;
      discord_message: { attachments: { transcript: string | null }[] };
    };
    expect(silent.content).toBe("");
    expect(silent.discord_message.attachments[0]?.transcript).toBeNull();
  } finally {
    vi.unstubAllGlobals();
  }
});
