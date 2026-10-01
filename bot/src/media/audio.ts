import { transcriptionEndpoint, transcriptionModel } from "../models.ts";
import { audioFormat, type Processor } from "./types.ts";

const apiKey = process.env.AI_API_KEY;

/**
 * Speech to text through OpenRouter's STT endpoint. `format` is a bare container
 * name ("ogg", "wav"), not a media type — that endpoint rejects "audio/ogg".
 */
export async function transcribe(audio: ArrayBuffer, format: string, language = "es"): Promise<string> {
  if (!apiKey) throw new Error("AI_API_KEY is required for transcription");

  const response = await fetch(transcriptionEndpoint, {
    method: "POST",
    signal: AbortSignal.timeout(60_000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: transcriptionModel,
      input_audio: { data: Buffer.from(audio).toString("base64"), format },
      language,
    }),
  });
  if (!response.ok) throw new Error(`Transcription failed (${response.status}): ${await response.text()}`);

  const result = (await response.json()) as { text?: string };
  return result.text?.trim() ?? "";
}

/** Voice notes and other audio become text in the message content. */
export const audioProcessor: Processor = {
  name: "transcribe",
  matches: (media) => media.contentType?.startsWith("audio/") ?? false,
  process: async (media) => ({
    text: await transcribe(media.bytes, audioFormat({ contentType: media.contentType, name: media.name })),
  }),
};
