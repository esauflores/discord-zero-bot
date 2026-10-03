import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Message } from "discord.js";
import { Type } from "typebox";

import { generateImage } from "@/infra/ai.ts";
import { pendingTasks, startTask } from "@/pipeline/tasks.ts";

export function generateImageTool(message: Message, state: { imageRequested: boolean }) {
  const result = (text: string) => ({ content: [{ type: "text" as const, text }], details: {} });
  return {
    name: "generate_image",
    label: "Generate image",
    description: "Start image generation in the background; the image is sent as a Discord attachment when ready.",
    parameters: Type.Object({ prompt: Type.String({ description: "Detailed image description" }) }),
    execute: async (_id: string, { prompt }: { prompt: string }) => {
      if (state.imageRequested) return result("Image already requested for this message.");
      if (!prompt.trim()) return result("Image prompt is empty.");
      const [busy] = pendingTasks(message.channelId);
      if (busy)
        return result(
          `${busy.task.name} is already running in this channel ("${busy.task.detail}", ${Math.round(busy.ageMs / 1000)}s ago). Do not start another; tell the user it is on the way.`,
        );
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
      return result("Image generation started; you may answer in text while it runs.");
    },
  } satisfies ToolDefinition;
}
