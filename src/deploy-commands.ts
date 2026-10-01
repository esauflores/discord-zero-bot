import { REST, Routes } from "discord.js";

import { client } from "./client.ts";

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error("DISCORD_TOKEN is required");

const rest = new REST({ version: "10" }).setToken(token);
const application = (await rest.get(Routes.oauth2CurrentApplication())) as { id: string };
const commands = [...client.commands.values()].map((command) => command.data.toJSON());
const guildId = process.env.GUILD_ID;
const route = guildId
  ? Routes.applicationGuildCommands(application.id, guildId)
  : Routes.applicationCommands(application.id);

await rest.put(route, { body: commands });
console.log(`Registered ${commands.length} command(s) ${guildId ? `for guild ${guildId}` : "globally"}.`);
