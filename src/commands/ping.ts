import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder().setName("ping").setDescription("Check that the bot is responding.");

export async function execute(interaction: import("discord.js").ChatInputCommandInteraction): Promise<void> {
  await interaction.reply("pong");
}
