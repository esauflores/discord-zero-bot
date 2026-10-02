import { saveMessage } from "@discord-zero-bot/database";
import type { Message } from "discord.js";

import { processMedia } from "@/media/index.ts";
import { archiveAttachment, bucket } from "@/media/storage.ts";

export async function record(msg: Message): Promise<void> {
  if (!msg.guild) return;

  const attachments = await Promise.all(
    [...msg.attachments.values()].map(async (attachment) => {
      let storageKey: string | null = null;
      let bytes: ArrayBuffer | null = null;
      try {
        const archived = await archiveAttachment(msg, attachment);
        storageKey = archived.key;
        bytes = archived.bytes;
      } catch (error) {
        console.error(`[attachment] ${msg.id}/${attachment.id} upload failed`, error);
      }
      // Media processors turn audio (and later images) into text, which lands in
      // `content` so search and the models get it without special handling.
      const text = bytes
        ? await processMedia({
            name: attachment.name,
            contentType: attachment.contentType,
            bytes,
          })
        : null;
      return {
        id: attachment.id,
        filename: attachment.name,
        size: attachment.size,
        url: attachment.url,
        proxy_url: attachment.proxyURL,
        content_type: attachment.contentType,
        width: attachment.width,
        height: attachment.height,
        description: attachment.description,
        storage_bucket: storageKey ? bucket : null,
        storage_key: storageKey,
        transcript: text,
      };
    }),
  );

  // Keep the spoken text in `content`: search, and the context sent to the models,
  // both read that column. The original audio stays reachable by storage_key.
  const processed = attachments
    .map((attachment) => attachment.transcript)
    .filter(Boolean)
    .join("\n");
  const content = [msg.content, processed].filter(Boolean).join("\n");

  await saveMessage({
    guild_id: msg.guild.id,
    channel_id: msg.channelId,
    discord_id: msg.id,
    author_id: msg.author.id,
    author_name: msg.author.username,
    content,
    discord_message: {
      id: msg.id,
      guild_id: msg.guild.id,
      channel_id: msg.channelId,
      author: {
        id: msg.author.id,
        username: msg.author.username,
        global_name: msg.author.globalName,
        avatar: msg.author.avatar,
        bot: msg.author.bot,
      },
      content: msg.content,
      timestamp: msg.createdAt.toISOString(),
      edited_timestamp: msg.editedAt?.toISOString() ?? null,
      type: msg.type,
      pinned: msg.pinned,
      tts: msg.tts,
      flags: msg.flags.bitfield,
      mentions: msg.mentions.users.map((user) => ({ id: user.id, username: user.username })),
      mention_roles: [...msg.mentions.roles.keys()],
      mention_everyone: msg.mentions.everyone,
      message_reference: msg.reference,
      embeds: msg.embeds.map((embed) => embed.toJSON()),
      components: msg.components.map((component) => component.toJSON()),
      attachments,
    },
    created_at: msg.createdAt,
  });
}
