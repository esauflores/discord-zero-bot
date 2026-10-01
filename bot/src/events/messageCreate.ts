import { record } from "../archive/record.ts";
import { reply } from "../reply.ts";

const guildId = process.env.GUILD_ID ?? "";
const allowedChannels = new Set(
  (process.env.CHANNEL_IDS ?? "")
    .split(",")
    .map((channelId) => channelId.trim())
    .filter(Boolean),
);

export async function execute(message: import("discord.js").Message): Promise<void> {
  // personal bot: scope to one guild (GUILD_ID) + optional channel allowlist
  if (guildId && message.guildId !== guildId) {
    console.log(`[skip] guild ${message.guildId} != configured ${guildId}`);
    return;
  }
  if (allowedChannels.size > 0 && !allowedChannels.has(message.channelId)) {
    console.log(`[skip] channel ${message.channelId} not in CHANNEL_IDS`);
    return;
  }
  if (message.author.bot) {
    // Keep our replies in channel history so follow-ups like "explica" have their referent.
    if (message.author.id === message.client.user.id) await record(message);
    return;
  }
  // TODO: notice/consent model before real data flows (README: "before real data flows").
  console.log(`[msg] #${message.channelId} ${message.author.username}: ${message.content.slice(0, 80)}`);
  await record(message);
  await reply(message);
}
