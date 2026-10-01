import { Events } from "discord.js";

import { record } from "../db/messages.ts";

export const name = Events.MessageCreate;

export async function execute(message: import("discord.js").Message): Promise<void> {
  if (message.author.bot) return;
  // TODO: establish the notice/consent model before real data flows (NOTES.md, next steps 6).
  await record(message);
}
