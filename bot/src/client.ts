import { Client, Events, GatewayIntentBits } from "discord.js";

import { execute as onMessageCreate } from "./events/messageCreate.ts";

export const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.on("error", (error) => console.error("Discord client error:", error));
client.on("warn", (warning) => console.warn("Discord client warning:", warning));
client.once(Events.ClientReady, (ready) => console.log(`logged in as ${ready.user.tag}`));
client.on(Events.MessageCreate, (message) => {
  void onMessageCreate(message).catch((error: unknown) => console.error(`Error in ${Events.MessageCreate}:`, error));
});
