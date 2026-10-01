import type { Message } from "discord.js";
import { and, desc, eq, gte } from "drizzle-orm";

import { db } from "./index.ts";
import { messages } from "./schema.ts";

export async function record(msg: Message): Promise<void> {
  if (!msg.guild) return;

  await db
    .insert(messages)
    .values({
      guild_id: msg.guild.id,
      channel_id: msg.channelId,
      discord_id: msg.id,
      author_id: msg.author.id,
      author_name: msg.author.username,
      content: msg.content,
      created_at: msg.createdAt,
    })
    .onConflictDoNothing({ target: messages.discord_id });
}

export async function context(channelId: string, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return db
    .select()
    .from(messages)
    .where(and(eq(messages.channel_id, channelId), gte(messages.created_at, since)))
    .orderBy(messages.created_at);
}

export async function recent(channelId: string, limit = 50) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.channel_id, channelId))
    .orderBy(desc(messages.created_at))
    .limit(limit);
}
