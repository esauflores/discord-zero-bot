import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, stepCountIs } from "ai";

import { chatEndpoint } from "../ai/models.ts";
import { generateImageTool } from "../tools/generate-image/index.ts";
import { openAttachment } from "../tools/open-attachment/index.ts";
import { reactToMessage } from "../tools/react/index.ts";
import { readChat } from "../tools/read-chat/index.ts";
import { respondInDiscord } from "../tools/respond-in-discord/index.ts";
import { webSearch } from "../tools/web-search/index.ts";
import type { Stage } from "./context.ts";
import { systemPrompt } from "./prompt.ts";

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

/** Runs the answer model and lets it call capabilities as tools. */
export const respond: Stage = async (ctx) => {
  const { message } = ctx;
  const result = await generateText({
    model: provider(ctx.model),
    system: `${systemPrompt}\nEste mensaje fue clasificado como dirigido a vos. Respondé naturalmente usando respond_in_discord; si piden una imagen, usá generate_image; si el mensaje trae un archivo o hay uno anterior que necesitás, usá open_attachment; podés reaccionar con react. Tu texto final no se publica.`,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: ctx.promptText },
          ...ctx.promptFiles.map((file) => ({ type: "file" as const, data: file.url, mediaType: file.mediaType })),
        ],
      },
    ],
    tools: {
      respond_in_discord: respondInDiscord(ctx.effects),
      read_chat: readChat(message),
      open_attachment: openAttachment(message),
      react: reactToMessage(ctx.effects),
      generate_image: generateImageTool(message, ctx.state),
      web_search: webSearch(message),
    },
    stopWhen: stepCountIs(6),
  });
  ctx.modelText = result.text;
  ctx.steps = result.steps?.length ?? 0;
};
