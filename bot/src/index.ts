#!/usr/bin/env bun
import { closeDb } from "@discord-zero-bot/database/client";

import { client } from "./client.ts";

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
