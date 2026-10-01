import { Client, GatewayIntentBits } from "discord.js";

export const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent],
});

client.on("error", (error) => console.error("Discord client error:", error));
client.on("warn", (warning) => console.warn("Discord client warning:", warning));

const eventFiles = new Bun.Glob("*.ts");
for await (const file of eventFiles.scan({ cwd: "./src/events" })) {
  const event = (await import(`./events/${file}`)) as {
    name: string;
    once?: boolean;
    execute: (...args: never[]) => Promise<void> | void;
  };
  const listener = (...args: never[]) => {
    void Promise.resolve(event.execute(...args)).catch((error: unknown) => {
      console.error(`Error in ${event.name}:`, error);
    });
  };
  if (event.once) client.once(event.name, listener as never);
  else client.on(event.name, listener as never);
}
