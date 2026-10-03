import type { Message } from "discord.js";

import { responseModel } from "../infra/ai.ts";
import { recent } from "../infra/database.ts";
import { classifyMessage } from "./classify.ts";
import { deliver, type Effect } from "./effects.ts";
import { record } from "./record.ts";
import { respond } from "./respond.ts";
import { pendingTasks } from "./tasks.ts";

type Timings = Record<string, number>;

async function timed<T>(timings: Timings, name: string, run: () => T | Promise<T>): Promise<T> {
  const started = Date.now();
  const result = await run();
  timings[name] = Date.now() - started;
  return result;
}

async function gate(message: Message, timings: Timings) {
  console.log(`[msg] #${message.channelId} ${message.author.username}: ${message.content.slice(0, 80)}`);
  if (message.author.bot) return null;

  const previous = (await timed(timings, "db", () => recent(message.channelId, 11)))
    .filter((entry) => entry.discord_id !== message.id)
    .slice(0, 10);
  const addressed = await timed(timings, "jev", () => classifyMessage(message, [...previous].reverse()));
  if (!addressed) return null;
  console.log(`[thinking] #${message.channelId} message ${message.id} model=${responseModel} (addressed)`);
  return previous;
}

function enrich(message: Message, previous: Awaited<ReturnType<typeof recent>>) {
  const context = [...previous]
    .reverse()
    .map((entry) => `${entry.author_name}: ${entry.content}`)
    .join("\n");
  const inProgress = pendingTasks(message.channelId)
    .map(
      ({ task, ageMs }) =>
        `\n\nEn progreso en este canal: ${task.name} ("${task.detail}") desde hace ${Math.round(ageMs / 1000)}s; el resultado aparece solo cuando esté listo. No lo repitas; si preguntan, decí que va en camino.`,
    )
    .join("");
  return {
    promptText: `Latest 10 messages for context:\n${context || "(none)"}\n\nDirected at you: yes\nCurrent message — ${message.author.username}: ${message.content || "(no text)"}${message.attachments.size ? `\nAttachment metadata (see attachment input status for content availability): ${[...message.attachments.values()].map((file) => `${file.name} (${file.contentType ?? "unknown type"}, ${file.size} bytes)`).join(", ")}` : ""}${inProgress}`,
  };
}

function timingLine(message: Message, timings: Timings, steps: number): string {
  const parts = Object.entries(timings).map(([name, ms]) => `${name}=${ms}ms`);
  return `[timing] #${message.channelId} message ${message.id} ${parts.join(" ")} steps=${steps}`;
}

export async function runChat(message: Message, receivedAt = Date.now()): Promise<void> {
  const guildId = process.env.GUILD_ID;
  const allowedChannels = (process.env.CHANNEL_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!message.guildId || (guildId && message.guildId !== guildId)) return;
  if (allowedChannels.length && !allowedChannels.includes(message.channelId)) return;
  if (message.author.bot && message.author.id !== message.client.user.id) return;

  const timings: Timings = {};
  let steps = 0;

  await timed(timings, "persist", () => record(message));
  const route = await timed(timings, "gate", () => gate(message, timings));
  if (route) {
    const prompt = await timed(timings, "enrich", () => enrich(message, route));
    const effects: Effect[] = [];
    const state = { imageRequested: false };
    const result = await timed(timings, "respond", () => respond({ message, effects, state, ...prompt }));
    steps = result.steps;
    await timed(timings, "deliver", () => deliver(message, effects, state.imageRequested));
  }

  timings.total = Date.now() - receivedAt;
  console.log(timingLine(message, timings, steps));
}
