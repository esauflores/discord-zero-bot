import type { Message } from "discord.js";

// OpenRouter is the only endpoint: the Decisions API is exclusive to it and the
// pinned models below are OpenRouter slugs, so there is nothing to configure.
const apiUrl = "https://openrouter.ai/api/v1";
const jevEndpoint = "https://openrouter.ai/api/alpha/decisions";
const jevModel = "typesafe/jev-1.13";

export const imageEndpoint = `${apiUrl}/images/generations`;
export const imageModel = "meta/muse-image";
export const transcriptionEndpoint = `${apiUrl}/audio/transcriptions`;
export const transcriptionModel = "openai/whisper-large-v3-turbo";

// Both accept text and images, so image messages and `open_attachment` results
// can go straight to them without a separate vision model.
const cheapModel = "deepseek/deepseek-v4.1-flash";
const smartModel = "deepseek/deepseek-v4.1-flash";
const names = /(?:^|[^\p{L}\p{N}_])(?:zerotillo-bot|zero-bot|zerotillo|zero)(?=$|[^\p{L}\p{N}_])/iu;

export async function classifyMessage(
  message: Message,
  previous: { author_name: string; content: string }[],
): Promise<{ addressed: boolean; model: string }> {
  const label = `[jev] #${message.channelId} message ${message.id}`;
  const direct =
    message.mentions.has(message.client.user) || message.mentions.repliedUser?.id === message.client.user.id;
  const started = Date.now();
  console.log(`${label} starting model=${jevModel} previous=${previous.length}`);
  try {
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) throw new Error("AI_API_KEY is required for Jev");
    const response = await fetch(jevEndpoint, {
      method: "POST",
      signal: AbortSignal.timeout(8_000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: jevModel,
        state: {
          previous_messages: previous.map(({ author_name, content }) => ({ author: author_name, text: content })),
          current_message: {
            author: message.author.username,
            text: message.content,
            has_attachments: message.attachments.size > 0,
          },
          bot_names: ["Zero", "Zerotillo", "Zerotillo-bot", "Zero-bot"],
        },
        questions: {
          addressed: {
            type: "noul",
            instructions:
              "Is the CURRENT message directed at the Discord bot (Zero/Zerotillo), including a clear conversational follow-up addressed to it? Judge in the context of the previous messages. Do not answer yes just because someone mentions the word zero in another sense.",
            criteria: {
              true: "The current author calls or asks the bot to reply, or continues a conversation with the bot.",
              false:
                "The author is speaking to other users, discussing the bot without addressing it, or using zero as an ordinary word or number.",
            },
          },
          needs_smart_model: {
            type: "noul",
            instructions:
              "If the bot answers the CURRENT message, does it need deeper reasoning or careful multi-step tool use? Judge the request, not just its length or whether it mentions the bot.",
            criteria: {
              true: "Complex analysis, multi-step reasoning, technical problem solving, or careful interpretation of a document or image.",
              false:
                "Casual chat, jokes, greetings, simple factual questions, simple tool use, or an image generation request.",
            },
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`Jev HTTP ${response.status}`);
    const data = (await response.json()) as {
      answers?: { addressed?: { noul?: number }; needs_smart_model?: { noul?: number } };
    };
    const addressedProbability = data.answers?.addressed?.noul;
    const smartProbability = data.answers?.needs_smart_model?.noul;
    if (
      typeof addressedProbability !== "number" ||
      !Number.isFinite(addressedProbability) ||
      addressedProbability < 0 ||
      addressedProbability > 1 ||
      typeof smartProbability !== "number" ||
      !Number.isFinite(smartProbability) ||
      smartProbability < 0 ||
      smartProbability > 1
    )
      throw new Error("Invalid Jev decision probabilities");
    const addressed = direct || addressedProbability > 0.5;
    const model = smartProbability > 0.5 ? smartModel : cheapModel;
    console.log(
      `${label} answered addressed=${addressedProbability.toFixed(2)} smart=${smartProbability.toFixed(2)} respond=${addressed} model=${model} ms=${Date.now() - started}`,
    );
    return { addressed, model };
  } catch (error) {
    const addressed = direct || names.test(message.content); // keep name calls working if Jev is unavailable
    console.error(`${label} failed fallback=${addressed} model=${smartModel} ms=${Date.now() - started}`, error);
    return { addressed, model: smartModel };
  }
}
