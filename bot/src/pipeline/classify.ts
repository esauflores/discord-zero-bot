import type { Message } from "discord.js";

import { addressedProbability, jevModel, responseModel } from "../infra/ai.ts";

const names = /(?:^|[^\p{L}\p{N}_])(?:zerotillo-bot|zero-bot|zerotillo|zero)(?=$|[^\p{L}\p{N}_])/iu;

export async function classifyMessage(
  message: Message,
  previous: { author_name: string; content: string }[],
): Promise<boolean> {
  const label = `[jev] #${message.channelId} message ${message.id}`;
  const direct =
    message.mentions.has(message.client.user) || message.mentions.repliedUser?.id === message.client.user.id;
  const started = Date.now();
  console.log(`${label} starting model=${jevModel} previous=${previous.length}`);
  try {
    const probability = await addressedProbability(
      {
        previous_messages: previous.map(({ author_name, content }) => ({ author: author_name, text: content })),
        current_message: {
          author: message.author.username,
          text: message.content,
          has_attachments: message.attachments.size > 0,
        },
        bot_names: ["Zero", "Zerotillo", "Zerotillo-bot", "Zero-bot"],
      },
      {
        instructions:
          "Is the CURRENT message directed at the Discord bot (Zero/Zerotillo), including a clear conversational follow-up addressed to it? Judge in the context of the previous messages. Do not answer yes just because someone mentions the word zero in another sense.",
        criteria: {
          true: "The current author calls or asks the bot to reply, or continues a conversation with the bot.",
          false:
            "The author is speaking to other users, discussing the bot without addressing it, or using zero as an ordinary word or number.",
        },
      },
    );
    const addressed = direct || probability > 0.5;
    console.log(
      `${label} answered addressed=${probability.toFixed(2)} respond=${addressed} model=${responseModel} ms=${Date.now() - started}`,
    );
    return addressed;
  } catch (error) {
    const addressed = direct || names.test(message.content); // keep name calls working if Jev is unavailable
    console.error(`${label} failed fallback=${addressed} model=${responseModel} ms=${Date.now() - started}`, error);
    return addressed;
  }
}
