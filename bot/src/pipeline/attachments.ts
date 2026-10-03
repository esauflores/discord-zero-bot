import type { ImageContent } from "@earendil-works/pi-ai";
import type { Message } from "discord.js";

const maxBytes = 5 * 1024 * 1024;
const supported = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]);
type Pdf = { type: "file"; file: { filename: string; file_data: string } };

/** Only current-message Discord CDN files; never arbitrary model-supplied URLs. */
export async function loadAttachments(message: Message) {
  const images: ImageContent[] = [];
  const pdfs: Pdf[] = [];
  const notes: string[] = [];
  let bytes = 0;
  let count = 0;
  for (const file of message.attachments.values()) {
    const mime = file.contentType?.split(";")[0]?.trim() ?? "";
    if (!supported.has(mime)) continue;
    try {
      if (++count > 3 || file.size > maxBytes - bytes)
        throw new Error("attachment budget exceeded (3 files / 5 MiB total)");
      const url = new URL(file.url);
      if (url.protocol !== "https:" || !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname))
        throw new Error("not a Discord CDN URL");
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "error" });
      if (!response.ok || !response.body) throw new Error(`download HTTP ${response.status}`);
      const chunks: Uint8Array[] = [];
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maxBytes) throw new Error("attachment byte budget exceeded");
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const data = Buffer.concat(chunks).toString("base64");
      if (mime === "application/pdf")
        pdfs.push({
          type: "file",
          file: { filename: file.name ?? "attachment.pdf", file_data: `data:application/pdf;base64,${data}` },
        });
      else images.push({ type: "image", mimeType: mime, data });
      notes.push(`${file.name}: supplied as ${mime === "application/pdf" ? "PDF" : "image"} input`);
    } catch (error) {
      notes.push(`${file.name}: contents unavailable (${error instanceof Error ? error.message : "download failed"})`);
    }
  }
  return { images, pdfs, notes };
}

export function addPdfs(payload: unknown, pdfs: Pdf[]): void {
  const request = payload as { messages?: { role: string; content: unknown }[]; plugins?: unknown[] };
  const user = request.messages
    ?.slice()
    .reverse()
    .find((entry) => entry.role === "user");
  if (!user || !pdfs.length) return;
  user.content = [...(Array.isArray(user.content) ? user.content : [{ type: "text", text: user.content }]), ...pdfs];
  request.plugins = [...(request.plugins ?? []), { id: "file-parser", pdf: { engine: "mistral-ocr" } }];
}
