# zero-discord-bot

A silent per-channel note-taker that stores Discord messages with author and timestamp attribution. The v4 shape and storage/retrieval decisions are documented in [NOTES.md](./NOTES.md).

## Setup

1. Create a Discord application and bot, enable the privileged **Message Content** intent, and invite it with the required bot and application-command scopes.
2. Copy `.env.example` to `.env` and set `DISCORD_TOKEN`, `DATABASE_URL`, `POSTGRES_PASSWORD`, and (for instant dev command registration) `GUILD_ID`.
3. Run:

   ```sh
   docker compose up -d
   bun install
   bun run db:push
   bun run deploy-commands
   bun run src/index.ts
   ```

The bot needs Message Content access to take notes. Tell server members clearly before enabling it; the notice/consent model must be decided before real data flows. Retention policy and edited/deleted-message handling are also TODOs before production use.
