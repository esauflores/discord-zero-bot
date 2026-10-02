import { audioProcessor } from "./audio.ts";
import type { MediaInput, Processor } from "./types.ts";

/** Register a media capability by adding its processor here. */
export const processors: Processor[] = [audioProcessor];

/**
 * Runs every processor that claims this attachment and joins their text. A failing
 * processor is logged and skipped, so one capability cannot break archiving.
 */
export async function processMedia(media: MediaInput): Promise<string | null> {
  const parts: string[] = [];
  for (const processor of processors) {
    if (!processor.matches(media)) continue;
    const started = Date.now();
    try {
      const { text } = await processor.process(media);
      if (text) parts.push(text);
      console.log(
        `[media] ${media.name} ${processor.name} ${Date.now() - started}ms${text ? ` result=${JSON.stringify(text)}` : ""}`,
      );
    } catch (error) {
      console.error(`[media] ${media.name} ${processor.name} failed`, error);
    }
  }
  return parts.filter(Boolean).join("\n") || null;
}

export { bucket } from "./storage.ts";
export { storedAttachments, type MediaInput, type Processor, type StoredAttachment } from "./types.ts";
