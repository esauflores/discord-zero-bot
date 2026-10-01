import { bucket, upload } from "@discord-zero-bot/storage";
import type { Attachment, Message } from "discord.js";

export { bucket };

/** Downloads an attachment from Discord, then stores it in SeaweedFS. */
export async function archiveAttachment(
  message: Message,
  attachment: Attachment,
): Promise<{ key: string; bytes: ArrayBuffer }> {
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
  const bytes = await download.arrayBuffer();
  await upload(key, bytes, attachment.contentType ?? "application/octet-stream");
  return { key, bytes };
}
