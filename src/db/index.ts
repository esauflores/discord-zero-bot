import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const client = postgres(connectionString, {
  onclose: () => console.warn("Database connection closed"),
});
export const db = drizzle(client, { schema });
export const closeDb = () => client.end();
