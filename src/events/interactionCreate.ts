import { Events } from "discord.js";

export const name = Events.InteractionCreate;

export async function execute(interaction: import("discord.js").Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;
  const command = interaction.client.commands.get(interaction.commandName);
  if (command) await command.execute(interaction);
}
