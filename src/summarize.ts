import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { and, asc, eq, gt, lte } from "drizzle-orm";

import { db } from "./db/index.ts";
import { messages } from "./db/schema.ts";
import { insert, maxWatermark } from "./db/summaries.ts";
import { summaryWindow } from "./summarize-window.ts";

const baseURL = process.env.AI_BASE_URL;
const apiKey = process.env.AI_API_KEY;
const modelId = process.env.AI_MODEL;
if (!baseURL || !apiKey || !modelId) {
  throw new Error("AI_BASE_URL, AI_API_KEY, and AI_MODEL are required");
}

const provider = createOpenAICompatible({ name: "openai-compatible", baseURL, apiKey });
const allowedChannels = (process.env.CHANNEL_IDS ?? "")
  .split(",")
  .map((channelId) => channelId.trim())
  .filter(Boolean);
let summarizing = false;

export async function summarizeDue(): Promise<void> {
  if (summarizing) return;
  summarizing = true;
  try {
    await summarizeChannels();
  } finally {
    summarizing = false;
  }
}

async function summarizeChannels(): Promise<void> {
  const channels =
    allowedChannels.length > 0
      ? allowedChannels
      : (await db.selectDistinct({ channel_id: messages.channel_id }).from(messages)).map((row) => row.channel_id);

  for (const channelId of channels) {
    const after = await maxWatermark(channelId);
    const through = new Date();
    const conditions = [eq(messages.channel_id, channelId), lte(messages.created_at, through)];
    if (after) conditions.push(gt(messages.created_at, after));
    const rows = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(asc(messages.created_at));
    const window = summaryWindow(rows, after, through);
    if (!window) continue;

    const conversation = window.messages.map((message) => `${message.author_name}: ${message.content}`).join("\n");
    const { text } = await generateText({
      model: provider(modelId!),
      system:
        "Summarize this conversation as internal channel memory. Capture who said what, decisions, useful facts, and questions left open. Write in the conversation's language. Be concise and factual.",
      prompt: conversation,
    });
    await insert({
      channel_id: channelId,
      watermark_from: window.from,
      watermark_to: window.to,
      content: text,
      model: modelId!,
    });
  }
}
