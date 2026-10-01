import { Client, Collection, GatewayIntentBits } from "discord.js";
import type { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

export type Command = {
  data: SlashCommandBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
};

declare module "discord.js" {
  interface Client {
    commands: Collection<string, Command>;
  }
}

export const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent],
});
client.commands = new Collection();

const commandFiles = new Bun.Glob("*.ts");
for await (const file of commandFiles.scan({ cwd: "./src/commands" })) {
  const command = (await import(`./commands/${file}`)) as Command;
  client.commands.set(command.data.name, command);
}

const eventFiles = new Bun.Glob("*.ts");
for await (const file of eventFiles.scan({ cwd: "./src/events" })) {
  const event = (await import(`./events/${file}`)) as {
    name: string;
    once?: boolean;
    execute: (...args: never[]) => void;
  };
  const listener = (...args: never[]) => void event.execute(...args);
  if (event.once) client.once(event.name, listener as never);
  else client.on(event.name, listener as never);
}
