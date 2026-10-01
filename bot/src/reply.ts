import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { recent } from "@discord-zero-bot/database/messages";
import { generateText, stepCountIs } from "ai";
import type { Message } from "discord.js";

import { classifyMessage } from "./classify.ts";
import { chatEndpoint } from "./models.ts";
import { systemPrompt } from "./prompt.ts";
import { generateImageTool } from "./tools/generate-image/index.ts";
import { openAttachment } from "./tools/open-attachment/index.ts";
import { reactToMessage } from "./tools/react/index.ts";
import { readChat } from "./tools/read-chat/index.ts";
import { respondInDiscord } from "./tools/respond-in-discord/index.ts";
import { webSearch } from "./tools/web-search/index.ts";

const apiKey = process.env.AI_API_KEY;
if (!apiKey) throw new Error("AI_API_KEY is required");

const provider = createOpenAICompatible({
  name: "openrouter",
  baseURL: chatEndpoint,
  apiKey,
  // OpenRouter forwards file parts returned by tools, so open_attachment can
  // hand an image or PDF back to the model.
  supportsMultiPartToolContent: true,
});

export async function reply(message: Message): Promise<void> {
  const messages = await recent(message.channelId, 11);
  const { addressed, model } = await classifyMessage(
    message,
    messages
      .filter((entry) => entry.discord_id !== message.id)
      .slice(0, 10)
      .reverse(),
  );
  if (!addressed) return;
  console.log(`[thinking] #${message.channelId} message ${message.id} model=${model} (addressed)`);
  const context = messages
    .slice(0, 10)
    .reverse()
    .map((entry) => `${entry.author_name}: ${entry.content}`)
    .join("\n");
  const attachments = [...message.attachments.values()].filter((attachment) => {
    const type = attachment.contentType?.split(";")[0]?.toLowerCase();
    const extension = attachment.name?.split(".").pop()?.toLowerCase();
    return (
      type?.startsWith("image/") ||
      type === "application/pdf" ||
      ["pdf", "csv", "xls", "xlsx", "ods", "ppt", "pptx", "odp"].includes(extension ?? "")
    );
  });
  const state = { responded: false, imageRequested: false, reacted: false };
  await generateText({
    model: provider(model),
    system: `${systemPrompt}\nEste mensaje fue clasificado como dirigido a vos. Respondé naturalmente usando respond_in_discord; si piden una imagen, usá generate_image; si el mensaje trae un archivo o hay uno anterior que necesitás, usá open_attachment; podés reaccionar con react. Tu texto final no se publica.`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Latest 10 messages for context:\n${context || "(none)"}\n\nDirected at you: yes\nCurrent message — ${message.author.username}: ${message.content || "(no text)"}`,
          },
          ...attachments.map((attachment) => ({
            type: "file" as const,
            data: attachment.url,
            mediaType:
              attachment.contentType?.split(";")[0]?.toLowerCase() ||
              (attachment.name?.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream"),
          })),
        ],
      },
    ],
    tools: {
      respond_in_discord: respondInDiscord(message, state),
      read_chat: readChat(message),
      open_attachment: openAttachment(message),
      react: reactToMessage(message, state),
      generate_image: generateImageTool(message, state),
      web_search: webSearch(message),
    },
    stopWhen: stepCountIs(6),
  });
  if (!state.responded && !state.imageRequested && !state.reacted)
    console.log(`[silent] #${message.channelId} message ${message.id}`);
}
