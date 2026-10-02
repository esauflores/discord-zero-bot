import { recent, type MessageRow } from "@discord-zero-bot/database";
import type { Message } from "discord.js";

import { classifyMessage } from "./ai.ts";
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

async function gate(message: Message, timings: Timings): Promise<{ chat: MessageRow[]; model: string } | null> {
  // The bot's own replies are recorded for context but never answered.
  if (message.author.bot) return null;

  const chat = await timed(timings, "db", () => recent(message.channelId, 11));
  const previous = chat
    .filter((entry) => entry.discord_id !== message.id)
    .slice(0, 10)
    .reverse();
  const transcription = [...message.attachments.values()]
    .map((attachment) => attachment.description)
    .filter(Boolean)
    .join("\n");
  const classifiedMessage = transcription
    ? Object.assign(Object.create(Object.getPrototypeOf(message)), message, {
        content: [message.content, transcription].filter(Boolean).join("\n"),
      })
    : message;
  const result = await timed(timings, "jev", () => classifyMessage(classifiedMessage, previous));
  if (!result.addressed) return null;
  console.log(`[thinking] #${message.channelId} message ${message.id} model=${result.model} (addressed)`);
  return { chat, model: result.model };
}

function enrich(message: Message, chat: MessageRow[]) {
  const context = chat
    .slice(0, 10)
    .reverse()
    .map((entry) => `${entry.author_name}: ${entry.content}`)
    .join("\n");
  const promptFiles = [...message.attachments.values()]
    .filter((attachment) => {
      const type = attachment.contentType?.split(";")[0]?.toLowerCase();
      const extension = attachment.name?.split(".").pop()?.toLowerCase();
      return (
        type?.startsWith("image/") ||
        type === "application/pdf" ||
        ["pdf", "csv", "xls", "xlsx", "ods", "ppt", "pptx", "odp"].includes(extension ?? "")
      );
    })
    .map((attachment) => ({
      url: attachment.url,
      mediaType:
        attachment.contentType?.split(";")[0]?.toLowerCase() ||
        (attachment.name?.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream"),
    }));
  const inProgress = pendingTasks(message.channelId)
    .map(
      ({ task, ageMs }) =>
        `\n\nEn progreso en este canal: ${task.name} ("${task.detail}") desde hace ${Math.round(ageMs / 1000)}s; el resultado aparece solo cuando esté listo. No lo repitas; si preguntan, decí que va en camino.`,
    )
    .join("");
  return {
    promptFiles,
    promptText: `Latest 10 messages for context:\n${context || "(none)"}\n\nDirected at you: yes\nCurrent message — ${message.author.username}: ${message.content || "(no text)"}${inProgress}`,
  };
}

function timingLine(message: Message, timings: Timings, steps: number): string {
  const parts = Object.entries(timings).map(([name, ms]) => `${name}=${ms}ms`);
  return `[timing] #${message.channelId} message ${message.id} ${parts.join(" ")} steps=${steps}`;
}

export async function runChat(message: Message, receivedAt = Date.now()): Promise<void> {
  const timings: Timings = {};
  let steps = 0;

  await timed(timings, "persist", () => record(message));
  const route = await timed(timings, "gate", () => gate(message, timings));
  if (route) {
    const prompt = await timed(timings, "enrich", () => enrich(message, route.chat));
    const effects: Effect[] = [];
    const state = { imageRequested: false };
    const result = await timed(timings, "respond", () =>
      respond({ message, model: route.model, effects, state, ...prompt }),
    );
    steps = result.steps;
    await timed(timings, "deliver", () => deliver(message, effects, result.modelText, state.imageRequested));
  }

  timings.total = Date.now() - receivedAt;
  console.log(timingLine(message, timings, steps));
}
