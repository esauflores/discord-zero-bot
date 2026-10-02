import { jsonSchema, tool } from "ai";
import type { Message } from "discord.js";

import { imageEndpoint, imageModel } from "@/pipeline/ai.ts";
import { pendingTasks, startTask } from "@/pipeline/tasks.ts";

export async function generateImage(prompt: string): Promise<Buffer> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) throw new Error("AI_API_KEY is required for image generation");

  const response = await fetch(imageEndpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: imageModel, prompt, n: 1 }),
  });
  if (!response.ok) throw new Error(`Image generation failed (${response.status}): ${await response.text()}`);

  const result = (await response.json()) as { data?: { b64_json?: string }[] };
  const image = result.data?.[0]?.b64_json;
  if (!image) throw new Error("Image generation returned no image data");
  return Buffer.from(image, "base64");
}

export function generateImageTool(message: Message, state: { imageRequested: boolean }) {
  return tool({
    description: "Start image generation in the background; the image is sent as a Discord attachment when ready.",
    inputSchema: jsonSchema<{ prompt: string }>({
      type: "object",
      properties: { prompt: { type: "string", description: "Detailed image description" } },
      required: ["prompt"],
      additionalProperties: false,
    }),
    execute: async ({ prompt }) => {
      if (state.imageRequested) return "Image already requested for this message.";
      if (!prompt.trim()) return "Image prompt is empty.";
      const [busy] = pendingTasks(message.channelId);
      if (busy)
        return `${busy.task.name} is already running in this channel ("${busy.task.detail}", ${Math.round(busy.ageMs / 1000)}s ago). Do not start another; tell the user it is on the way.`;
      state.imageRequested = true;
      console.log(`[tool] #${message.channelId} message ${message.id} generate_image started`);
      startTask(message.channelId, { name: "generate_image", detail: prompt }, async () => {
        try {
          const image = await generateImage(prompt);
          await message.reply({ files: [{ attachment: image, name: "generated.png" }] });
          console.log(`[sent] #${message.channelId} message ${message.id} image`);
        } catch (error) {
          console.error(`[image] #${message.channelId} message ${message.id}`, error);
          await message.reply("No pude generar la imagen.").catch(console.error);
        }
      });
      return "Image generation started; you may answer in text while it runs.";
    },
  });
}
