# zero-discord-bot

Silent, per-channel note-taker for my study Discord server. It watches messages,
records what people said (author + timestamp), and keeps context grouped by
channel. No chat replies, no commands except `/ping` (smoke). Specific bot for my
server — not a product.

## how it works

**boot** (`src/index.ts`): env → postgres (drizzle) → client
(intents: `Guilds` + `MessageContent`) → load events/commands → gateway login.

**every message** (`src/events/messageCreate.ts`): skip bots → `record()` →
one `messages` row (guild, channel, discord_id, author, content, created_at).
`discord_id` is unique with `onConflictDoNothing`, so redelivered gateway events
never create duplicates.

**memory is just queries** (`src/db/messages.ts`) — no merge job:

- `context(channel, 24h)` — the short memory: what people said in the last day
- `recent(channel, 50)` — last messages
- large memory = the same table without the time cutoff

**`/ping`** is the only command — registered per-guild (`GUILD_ID`, instant) by
`bun run deploy-commands`, or globally without it.

## stack (decided)

| piece               | choice                                        | notes                                                                                                  |
| ------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| bot framework       | discord.js v14                                | ecosystem default                                                                                      |
| runtime             | bun                                           | gateway/voice have tracked bun issues — spike-test resume before trusting (bun#2077, discord.js#10840) |
| storage             | postgres + drizzle-orm (postgres-js)          | `bun run db:push`; schema in `src/db/schema.ts`                                                        |
| AI layer (deferred) | Vercel AI SDK (`ai` + `@ai-sdk/*`)            | provider-swappable; **no Ollama** (LM Studio / llama.cpp `llama-server` as local paths)                |
| tooling             | oxlint + oxfmt --check + tsc --noEmit, vitest | `bun run check`                                                                                        |

## retrieval ladder (deferred — only when `/ask` is real)

1. **postgres `tsvector` full-text search** — zero new infra, try first
   (opencode ships no RAG at all — grep + LSP + context stuffing)
2. **pgvector + AI SDK `embed()`** — model: hosted `text-embedding-3-small` or
   local transformers.js/ONNX when message locality matters; store model id +
   dimension with vectors
3. RAG frameworks — never; retrieval is `ORDER BY embedding <=> $1 LIMIT k`

## research basis (2025–2026)

- baseline server bots are utilities (MEE6/Dyno/Carl-bot); recap/assistant bots
  are small and fragmented (Summary Bot self-reports ~792 servers)
- the loved UX is **private, on-demand, cited** (`/catchup`, `/ask` + jump-links);
  unsolicited channel posts are the annoyance pattern
- **silent archiving is rare and trust-costly** — notice/consent + retention are
  core constraints, not polish ([Developer Policy](https://discord.com/developers/docs/policies-and-agreements/developer-policy))
- no standard memory stack exists: time-window digests → pgvector RAG with
  maintained summaries; raw rows stay the source of truth
- platform policy: app verification past 100 guilds; privileged-intent review at
  10k accessible users; Message Content intent is privileged and we need it
- voice (parked): Polly ≈ $0.11/30 min, ElevenLabs from $6/mo; `@discordjs/voice`
  accepts streams — revisit only if audio returns to scope
- hosting when deployed: Fly ≈ $1.94/mo, Railway $5, Render Starter $7 —
  never free tiers (they spin down)

## setup

```bash
cp .env.example .env     # DISCORD_TOKEN, DATABASE_URL, GUILD_ID
docker compose up -d
bun install
bun run db:push
bun run deploy-commands
bun run src/index.ts
```

Portal: create an app at developer.discord.com → Bot → token; OAuth2 scopes
`bot` + `applications.commands`; enable the **Message Content** intent.

## before real data flows (TODO)

- **notice/consent**: tell the server the bot takes notes
- **retention + edit/delete handling**: upsert or version edits; purge or
  tombstone deletions

## dev

`bun run check` (lint + format + types) · `bun run check:fix` · `bun run test`
