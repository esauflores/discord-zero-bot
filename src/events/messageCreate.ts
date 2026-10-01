import { Events } from "discord.js";

import { record } from "../db/messages.ts";
import { reply } from "../reply.ts";

const allowedChannels = new Set(
  (process.env.CHANNEL_IDS ?? "")
    .split(",")
    .map((channelId) => channelId.trim())
    .filter(Boolean),
);

export const name = Events.MessageCreate;

export async function execute(message: import("discord.js").Message): Promise<void> {
  if (message.author.bot || (allowedChannels.size > 0 && !allowedChannels.has(message.channelId))) return;
  // TODO: establish the notice/consent model before real data flows (NOTES.md, next steps 6).
  await record(message);

  const mentioned = message.mentions.has(message.client.user);
  if (!mentioned) {
    if (!message.reference) return;
    const referenced = await message.fetchReference();
    if (referenced.author.id !== message.client.user.id) return;
  }

  await message.reply(await reply(message));
}
