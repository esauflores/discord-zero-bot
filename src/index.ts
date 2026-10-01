#!/usr/bin/env bun
import { client } from "./client.ts";
import { closeDb } from "./db/index.ts";
import { summarizeDue } from "./summarize.ts";

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error("DISCORD_TOKEN is required");

await client.login(token);

const summaryIntervalMinutes = Number(process.env.SUMMARY_INTERVAL_MINUTES ?? 60);
const summaryInterval = setInterval(
  () => void summarizeDue().catch((error) => console.error("Error summarizing conversations:", error)),
  summaryIntervalMinutes * 60 * 1000,
);

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(summaryInterval);
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
