#!/usr/bin/env bun
import { closeDb } from "@discord-zero-bot/database";
import { Client, Events, GatewayIntentBits } from "discord.js";

import { execute as onMessageCreate } from "./events/messageCreate.ts";

export { runChat } from "./pipeline/index.ts";

export const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.on("error", (error) => console.error("Discord client error:", error));
client.on("warn", (warning) => console.warn("Discord client warning:", warning));
client.once(Events.ClientReady, (ready) => console.log(`logged in as ${ready.user.tag}`));
client.on(Events.MessageCreate, (message) => {
  void onMessageCreate(message).catch((error: unknown) => console.error(`Error in ${Events.MessageCreate}:`, error));
});

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error("DISCORD_TOKEN is required");

await client.login(token);

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    void (async () => {
      try {
        await client.destroy();
        await closeDb();
      } catch (error) {
        console.error("Error during shutdown:", error);
        process.exitCode = 1;
      } finally {
        process.exit();
      }
    })();
  });
}
