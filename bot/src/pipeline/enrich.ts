import { pendingTasks } from "@/tasks/index.ts";

import type { Stage } from "./context.ts";

/**
 * Builds what the model sees: recent history, the current message, any file it can
 * read directly, and background work already running in this channel.
 */
export const enrich: Stage = async (ctx) => {
  const { message } = ctx;
  const context = ctx.chat
    .slice(0, 10)
    .reverse()
    .map((entry) => `${entry.author_name}: ${entry.content}`)
    .join("\n");

  ctx.promptFiles = [...message.attachments.values()]
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

  // Background work started by an earlier message is invisible to this model call:
  // nothing about it is in the channel history yet. Tell the model what is running.
  const inProgress = pendingTasks(message.channelId)
    .map(
      ({ task, ageMs }) =>
        `\n\nEn progreso en este canal: ${task.name} ("${task.detail}") desde hace ${Math.round(ageMs / 1000)}s; el resultado aparece solo cuando esté listo. No lo repitas; si preguntan, decí que va en camino.`,
    )
    .join("");

  ctx.promptText = `Latest 10 messages for context:\n${context || "(none)"}\n\nDirected at you: yes\nCurrent message — ${message.author.username}: ${message.content || "(no text)"}${inProgress}`;
};
