import { jsonSchema, tool } from "ai";
import type { Message } from "discord.js";

import { generateImage } from "./imageGeneration.ts";

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
      state.imageRequested = true;
      console.log(`[tool] #${message.channelId} message ${message.id} generate_image started`);
      // ponytail: in-process background job; use a durable queue if restart safety matters.
      void generateImage(prompt)
        .then((image) => message.reply({ files: [{ attachment: image, name: "generated.png" }] }))
        .then(() => console.log(`[sent] #${message.channelId} message ${message.id} image`))
        .catch((error: unknown) => {
          console.error(`[image] #${message.channelId} message ${message.id}`, error);
          return message.reply("No pude generar la imagen.").catch(console.error);
        });
      return "Image generation started; you may answer in text while it runs.";
    },
  });
}
