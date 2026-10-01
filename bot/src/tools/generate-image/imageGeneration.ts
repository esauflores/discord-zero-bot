import { imageEndpoint, imageModel } from "../../ai/models.ts";

const apiKey = process.env.AI_API_KEY;
const model = imageModel;

export async function generateImage(prompt: string): Promise<Buffer> {
  if (!apiKey) throw new Error("AI_API_KEY is required for image generation");

  const response = await fetch(imageEndpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, n: 1 }),
  });
  if (!response.ok) throw new Error(`Image generation failed (${response.status}): ${await response.text()}`);

  const result = (await response.json()) as { data?: { b64_json?: string }[] };
  const image = result.data?.[0]?.b64_json;
  if (!image) throw new Error("Image generation returned no image data");
  return Buffer.from(image, "base64");
}
