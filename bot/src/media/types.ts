import type { Attachment } from "discord.js";

/** An attachment's bytes plus the metadata a processor needs to decide on it. */
export type MediaInput = {
  name: string;
  contentType: string | null;
  bytes: ArrayBuffer;
};

/**
 * Turns one kind of attachment into text for the message content. Add a new
 * capability by writing one of these and registering it in `media/index.ts`.
 */
export type Processor = {
  name: string;
  matches: (media: MediaInput) => boolean;
  process: (media: MediaInput) => Promise<{ text?: string }>;
};

/** An attachment as saved in a message's Discord snapshot. */
export type StoredAttachment = {
  id: string;
  filename: string;
  content_type: string | null;
  size: number;
  storage_key: string | null;
  transcript?: string | null;
};

export function storedAttachments(snapshot: unknown): StoredAttachment[] {
  const attachments = (snapshot as { attachments?: StoredAttachment[] } | null)?.attachments;
  return Array.isArray(attachments) ? attachments : [];
}

/** Bare container name for the STT endpoint, which rejects full media types. */
export function audioFormat(attachment: Pick<Attachment, "contentType" | "name">): string {
  const type = attachment.contentType?.split(";")[0]?.trim();
  const subtype = type?.startsWith("audio/") ? type.slice("audio/".length) : "";
  if (subtype === "mpeg") return "mp3";
  if (subtype === "x-wav" || subtype === "wave") return "wav";
  if (subtype) return subtype;
  return attachment.name?.split(".").pop()?.toLowerCase() ?? "ogg";
}
