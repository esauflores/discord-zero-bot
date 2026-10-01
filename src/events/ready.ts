import { Events } from "discord.js";

export const name = Events.ClientReady;
export const once = true;

export function execute(client: { user: { tag: string } }): void {
  console.log(`logged in as ${client.user.tag}`);
}
