import type { Message } from "discord.js";

import type { ChatContext, Stage } from "./context.ts";
import { deliver } from "./deliver.ts";
import { enrich } from "./enrich.ts";
import { gate } from "./gate.ts";
import { record } from "./record.ts";
import { respond } from "./respond.ts";

/** Stores the message and archives its media, before anything decides to answer. */
const persist: Stage = async (ctx) => {
  await record(ctx.message);
};

/** The chain every message runs through. Append a stage to add a behavior. */
const chatStages = [persist, gate, enrich, respond, deliver];

function timingLine(ctx: ChatContext): string {
  const parts = Object.entries(ctx.timings).map(([name, ms]) => `${name}=${ms}ms`);
  return `[timing] #${ctx.message.channelId} message ${ctx.message.id} ${parts.join(" ")} steps=${ctx.steps}`;
}

export async function runChat(message: Message, receivedAt = Date.now()): Promise<void> {
  const context: ChatContext = {
    message,
    receivedAt,
    chat: [],
    addressed: false,
    model: "",
    state: { imageRequested: false },
    effects: [],
    modelText: "",
    steps: 0,
    promptText: "",
    promptFiles: [],
    sent: false,
    fallback: false,
    halt: false,
    timings: {},
  };

  for (const stage of chatStages satisfies Stage[]) {
    const started = Date.now();
    await stage(context);
    context.timings[stage.name] = Date.now() - started;
    if (context.halt) break;
  }
  context.timings.total = Date.now() - context.receivedAt;
  console.log(timingLine(context));
}
