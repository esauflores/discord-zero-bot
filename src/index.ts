#!/usr/bin/env bun
import { client } from "./client.ts";

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error("DISCORD_TOKEN is required");

await client.login(token);
