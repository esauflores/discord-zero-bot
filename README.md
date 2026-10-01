# discord-zero-bot

A conversational participant for my study Discord server. It records messages
(channel memory) and only talks when mentioned or directly replied to. No slash
commands and no unsolicited posts. Specific bot for my server — not a product.

## how it works

**boot** (`src/index.ts`): env → postgres (drizzle) → Discord client
(intents: `Guilds` + `MessageContent`) → load events → gateway login. `CHANNEL_IDS`
can restrict both recording and replies to a comma-separated set of channel IDs;
empty means all channels.

**every message** (`src/events/messageCreate.ts`): skip bots and disallowed
channels → `record()` → if mentioned or replying to one of the bot's messages,
fetch the last 50 messages plus the latest summary and answer in-channel using
the AI SDK. Replies can call `search_memory` for channel history and `web_search`
(Brave Search API; optional `BRAVE_API_KEY`) for external research. Ordinary conversation
remains silent. `discord_id` is unique with `onConflictDoNothing`, so redelivered
gateway events never create duplicates.

**memory** (`src/db/messages.ts`, `src/db/summaries.ts`): raw messages remain the
source of truth; short memory is recent messages, and summaries are derived
large memory. Every `SUMMARY_INTERVAL_MINUTES` (default 60), the bot summarizes
new messages in the configured channels (or all channels when `CHANNEL_IDS` is
empty). Summaries are internal memory only and are never posted to Discord.

## stack (decided)

| piece           | choice                                             | notes                                                                                                                                                                                      |
| --------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| bot framework   | discord.js v14                                     | ecosystem default                                                                                                                                                                          |
| runtime         | bun                                                | spike 2026-10: S1–S4 PASS on bun 1.4.2 (client, REST 401, gateway Hello/4004, clean self-exit) — node 24 identical as fallback. S5 (network-resume, tracked bun#2077) pending a real token |
| storage         | postgres + drizzle-orm (postgres-js)               | `bun run db:push`; schema in `src/db/schema.ts`                                                                                                                                            |
| AI layer (core) | Vercel AI SDK (`ai` + `@ai-sdk/openai-compatible`) | wired to OpenRouter (`openrouter.ai/api/v1`) — model `xiaomi/mimo-v2.6-flash`; endpoint-swappable (LM Studio / llama.cpp work too), no Ollama                                              |
| tooling         | oxlint + oxfmt --check + tsc --noEmit, vitest      | `bun run check`                                                                                                                                                                            |

AI endpoint configuration comes from `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL`.
Use an OpenAI-compatible server such as LM Studio (`http://localhost:1234/v1`),
llama.cpp `llama-server` (`http://localhost:8080/v1`), or another compatible API.

## retrieval ladder (deferred — only when channel memory needs more)

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
cp .env.example .env     # set DISCORD_TOKEN, DATABASE_URL, and AI_* values
# optionally set CHANNEL_IDS to a comma-separated channel allowlist
# empty CHANNEL_IDS means every channel
# SUMMARY_INTERVAL_MINUTES controls internal summary cadence (default 60)
# BRAVE_API_KEY enables Brave web research in mention-triggered replies
# AI_BASE_URL is the OpenAI-compatible endpoint, e.g. localhost:1234/v1
# AI_API_KEY can be a placeholder for local servers that don't require one
# AI_MODEL is the model identifier exposed by the server
docker compose up -d
bun install
bun run db:push
bun run src/index.ts
```

Portal: create an app at developer.discord.com → Bot → token; OAuth2 scope
`bot`; enable the **Message Content** intent.

## before real data flows (TODO)

- **notice/consent**: tell the server the bot takes notes
- **retention + edit/delete handling**: upsert or version edits; purge or
  tombstone deletions

## dev

`bun run check` (lint + format + types) · `bun run check:fix` · `bun run test`
