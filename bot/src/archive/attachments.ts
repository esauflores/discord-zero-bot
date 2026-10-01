import { bucket, upload } from "@discord-zero-bot/storage";
import type { Attachment, Message } from "discord.js";

export { bucket };

export type StoredAttachment = {
  id: string;
  filename: string;
  content_type: string | null;
  size: number;
  storage_key: string | null;
};

/** Attachments saved in a message's Discord snapshot. */
export function storedAttachments(snapshot: unknown): StoredAttachment[] {
  const attachments = (snapshot as { attachments?: StoredAttachment[] } | null)?.attachments;
  return Array.isArray(attachments) ? attachments : [];
}

export async function archiveAttachment(message: Message, attachment: Attachment): Promise<string> {
  const key = `${message.guildId}/${message.channelId}/${message.id}/${attachment.id}`;
  let url: URL;
  try {
    url = new URL(attachment.url);
  } catch {
    throw new Error("Invalid Discord attachment URL");
  }
  if (url.protocol !== "https:" || !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname)) {
    throw new Error(`Unexpected Discord attachment host: ${url.hostname}`);
  }
  const download = await fetch(url, { redirect: "error" });
  if (!download.ok) throw new Error(`Discord attachment download failed: ${download.status}`);
  await upload(key, await download.arrayBuffer(), attachment.contentType ?? "application/octet-stream");
  return key;
}
