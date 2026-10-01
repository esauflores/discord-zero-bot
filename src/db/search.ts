import { and, desc, eq, ilike } from "drizzle-orm";

import { db } from "./index.ts";
import { messages, summaries } from "./schema.ts";

export async function searchMemory(channelId: string, query: string) {
  const pattern = `%${query}%`;
  const [messageHits, summaryHits] = await Promise.all([
    db
      .select({ content: messages.content, author_name: messages.author_name, created_at: messages.created_at })
      .from(messages)
      .where(and(eq(messages.channel_id, channelId), ilike(messages.content, pattern)))
      .orderBy(desc(messages.created_at))
      .limit(10),
    db
      .select({ content: summaries.content, created_at: summaries.created_at })
      .from(summaries)
      .where(and(eq(summaries.channel_id, channelId), ilike(summaries.content, pattern)))
      .orderBy(desc(summaries.created_at))
      .limit(10),
  ]);
  return [
    ...messageHits.map((hit) => ({ ...hit, kind: "message" as const })),
    ...summaryHits.map((hit) => ({ ...hit, kind: "summary" as const })),
  ]
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(0, 10);
}
