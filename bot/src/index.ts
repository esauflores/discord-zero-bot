#!/usr/bin/env bun
import { Client, Events, GatewayIntentBits } from "discord.js";

import { closeDb } from "./infra/database.ts";
import { runChat } from "./pipeline/index.ts";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.on("error", (error) => console.error("Discord client error:", error));
client.on("warn", (warning) => console.warn("Discord client warning:", warning));
client.once(Events.ClientReady, (ready) => console.log(`logged in as ${ready.user.tag}`));
client.on(Events.MessageCreate, (message) => {
  void runChat(message).catch((error: unknown) => console.error(`Error in ${Events.MessageCreate}:`, error));
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
        closeDb();
      } catch (error) {
        console.error("Error during shutdown:", error);
        process.exitCode = 1;
      } finally {
        process.exit();
      }
    })();
  });
}
