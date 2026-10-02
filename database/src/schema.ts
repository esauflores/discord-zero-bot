// Tables live next to their queries in the per-entity modules; this barrel is
// the schema drizzle-kit and the db client load. Add future tables here.

import { messages } from "./schema/messages";

export * from "./schema/messages";

export const schema = {
  messages,
};
