import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

// These models and the Decisions API are specific to OpenRouter.
const apiUrl = "https://openrouter.ai/api/v1";
export const jevModel = "typesafe/jev-1.13";
export const responseModel = "deepseek/deepseek-v4.1-flash";
const imageModel = "meta/muse-image";

let runtime: ReturnType<typeof ModelRuntime.create> | undefined;

export async function getResponseModel() {
  const key = process.env.AI_API_KEY;
  if (!key) throw new Error("AI_API_KEY is required");
  const modelRuntime = await (runtime ??= import("@earendil-works/pi-coding-agent").then(({ ModelRuntime }) =>
    ModelRuntime.create({ modelsPath: null, authPath: "/dev/null" }),
  ));
  await modelRuntime.setRuntimeApiKey("openrouter", key);
  const model = modelRuntime.getModel("openrouter", responseModel);
  if (!model) throw new Error(`Model not found in registry: openrouter/${responseModel}`);
  return { modelRuntime, model };
}

export async function addressedProbability(
  state: {
    previous_messages: { author: string; text: string }[];
    current_message: { author: string; text: string; has_attachments: boolean };
    bot_names: string[];
  },
  question: { instructions: string; criteria: { true: string; false: string } },
): Promise<number> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) throw new Error("AI_API_KEY is required for Jev");
  const response = await fetch("https://openrouter.ai/api/alpha/decisions", {
    method: "POST",
    signal: AbortSignal.timeout(8_000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: jevModel, state, questions: { addressed: { type: "noul", ...question } } }),
  });
  if (!response.ok) throw new Error(`Jev HTTP ${response.status}`);
  const data = (await response.json()) as { answers?: { addressed?: { noul?: number } } };
  const probability = data.answers?.addressed?.noul;
  if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new Error("Invalid Jev decision probabilities");
  }
  return probability;
}

export async function generateImage(prompt: string): Promise<Buffer> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) throw new Error("AI_API_KEY is required for image generation");
  const response = await fetch(`${apiUrl}/images/generations`, {
    method: "POST",
    signal: AbortSignal.timeout(90_000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: imageModel, prompt, n: 1 }),
  });
  if (!response.ok) throw new Error(`Image generation failed (${response.status}): ${await response.text()}`);
  const result = (await response.json()) as { data?: { b64_json?: string }[] };
  const image = result.data?.[0]?.b64_json;
  if (!image) throw new Error("Image generation returned no image data");
  return Buffer.from(image, "base64");
}
