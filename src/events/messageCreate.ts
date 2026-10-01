import { Events } from "discord.js";

import { record } from "../db/messages.ts";
import { reply } from "../reply.ts";

const guildId = process.env.GUILD_ID ?? "";
const allowedChannels = new Set(
  (process.env.CHANNEL_IDS ?? "")
    .split(",")
    .map((channelId) => channelId.trim())
    .filter(Boolean),
);

export const name = Events.MessageCreate;

export async function execute(message: import("discord.js").Message): Promise<void> {
  // personal bot: scope to one guild (GUILD_ID) + optional channel allowlist
  if (message.author.bot) return;
  if (guildId && message.guildId !== guildId) return;
  if (allowedChannels.size > 0 && !allowedChannels.has(message.channelId)) return;
  // TODO: notice/consent model before real data flows (README: "before real data flows").
  console.log(`[msg] #${message.channelId} ${message.author.username}: ${message.content.slice(0, 80)}`);
  await record(message);

  const mentioned = message.mentions.has(message.client.user);
  if (!mentioned) {
    if (!message.reference) return;
    const referenced = await message.fetchReference();
    if (referenced.author.id !== message.client.user.id) return;
  }

  console.log(`[reply] -> ${message.author.username} in #${message.channelId}`);
  await message.reply(await reply(message));
}
