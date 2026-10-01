# discord bot — research notes (2026-10)

Goal: pick the stack and shape before writing code. Round 1 inline + round 2
delegated researcher (bun issues, template audit, hosting pricing, Discord policy)

- round 3 (voice tooling costs: amazon vs elevenlabs).
  Full researcher report: ~/.pi/agent/sessions/.../subagent-artifacts/outputs/d275eaeb.../research.md

## stack verdict

**discord.js v14 + TypeScript** — marry. Ecosystem default, typed slash builders.
**Bun as runtime** — kiss with a caveat, not a free win: the official bun.sh guide
covers the happy path, but issue trackers show Bun-specific gateway failures under
network loss ([bun#2077](https://github.com/oven-sh/bun/issues/2077),
[discord.js#10840](https://github.com/discordjs/discord.js/issues/10840) — closed
not-planned) and open voice incompatibilities ([discord.js#10296](https://github.com/discordjs/discord.js/issues/10296),
[bun#11313](https://github.com/oven-sh/bun/issues/11313), updated 2026-01).
A hello-world passing is not certification.

| option                                               | verdict   | why                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| discord.js v14                                       | marry     | default; typed slash commands; biggest community for weird API questions                                                                                                                                                                                             |
| bun runtime                                          | kiss      | fine for basic bots — but spike-test gateway interruption/resume + voice on the exact versions; if voice or max compat matters, use Node                                                                                                                             |
| HTTP-only interactions (@discordjs/rest, no gateway) | kiss      | only if the bot is pure slash commands and must run serverless                                                                                                                                                                                                       |
| decorator/DSL wrappers + community templates         | kiss→kill | all four audited templates are low-adoption (0–4 stars; lon21 self-labels early-access). Scaffold from the official discord.js guide instead                                                                                                                         |
| discord.py / serenity / twilight                     | kill      | wrong stack for us                                                                                                                                                                                                                                                   |
| **Vercel AI SDK** (`ai` + `@ai-sdk/*`)               | **marry** | the AI layer, DECIDED: `embed()` + streaming `/ask`; provider-swappable — hosted or `@ai-sdk/openai-compatible` local (LM Studio `:1234/v1`, llama.cpp `llama-server` `:8080/v1`). **No Ollama** (explicitly rejected). Same layer opencode's provider stack runs on |

## architecture decisions (default answers)

1. **Gateway bot** (long-lived WebSocket) — needed for messages, reactions, presence,
   scheduled jobs. Only pick HTTP-interactions if the bot is stateless slash-only.
2. **Slash commands only** — message/prefix commands need the privileged Message
   Content intent and are legacy UX.
3. **Intents: Guilds + MessageContent.** The bot reads messages (that IS the
   feature), so Message Content is required — it's a privileged intent: enable in
   portal while under the review threshold, and tell the server the bot is
   taking notes (transparency + data minimization per Developer Policy).
4. **Command handling**: one file per command, dynamically loaded (discord.js guide's
   pattern); events in `src/events/`; shared logic in `src/helpers/` (from npm-cli-base).
5. **Deploy commands separately** — definitions live in shared source, a
   `deploy-commands.ts` does the REST registration:
   `Routes.applicationGuildCommands(appId, guildId)` while developing (instant),
   `Routes.applicationCommands(appId)` globally when stable.
6. **Rate limits**: trust discord.js's REST handler; never hand-roll limit logic.
   Gateway _resume_ is a protocol nicety, not availability: log disconnects/errors,
   let the library reconnect, rely on host restart policy. No custom reconnect loops
   unless a reproduced failure forces one.

## portal checklist (one-time)

- developer.discord.com → New Application → Bot → copy token → `.env` (`DISCORD_TOKEN`)
- OAuth2 → URL Generator: scopes `bot` + `applications.commands`, minimal permissions
  (SendMessages, EmbedLinks, AttachFiles) → invite via generated URL
- Privileged intents (Guild Members / Presences / Message Content): enable in portal
  while under threshold; approval review kicks in at **10,000 unique users able to
  access the app** (newer policy — replaces the old 100-guild intent threshold)
- App **verification** is separate: required to scale past **100 guilds**
- Bot accounts only — self-bots / user tokens are banned (Developer Policy)

## hosting — a gateway must stay online

| host                    | real cost                               | trap                                             |
| ----------------------- | --------------------------------------- | ------------------------------------------------ |
| Fly shared-cpu-1x/256MB | ~$1.94/mo listed (storage/egress extra) | cheapest; verify live pricing                    |
| Railway Hobby           | $5/mo minimum usage                     | charges resource usage while running             |
| Render Starter          | $7/mo                                   | **Render Free spins down — never for a gateway** |
| VPS                     | $5–25/mo                                | more ops, full control                           |

Verdict: **Fly for cheapest / Railway for familiar tooling** (backend-base already
has Railway wiring). Never assume "free" = persistent. Recheck pricing at deploy time.

## ops notes

- token never in code/repo; env only (`DISCORD_TOKEN`, dev guild id)
- service needs restart policy + error/disconnect logging even though discord.js
  reconnects and handles API rate limits
- dev vs prod registration: guild-scoped (instant) → global (slower propagation,
  don't promise exact latency)

## shape — DECIDED (v4)

Silent note-taker: the bot watches messages and tracks **what people said**
(author + timestamp attribution), grouped by channel. No user-facing command
surface, no audio — internal context is the product.

- **short memory** = a query: the last 24h per channel
- **large memory** = the same table, everything — no second tier, no physical merge
- **no daily merge job**: research verdict — a timestamp window replaces it;
  rollup summaries only earn their keep when raw context exceeds a measured
  prompt/retrieval budget (and then they're derived + idempotent, never instead
  of the raw rows)
- retrieval can come later (`/ask` or an export); v1 is just the keeping
- privacy: Message Content intent + a one-time "this bot takes notes" notice

Storage: `data/<guild>/<channel>/{short,large}.json`, atomic writes. Merge runs on
an in-process daily timer (no cron dependency). API sketch in `src/memory.ts`:
`record(channel, entry)`, `rolloverAll()`, `context(channel) → { short, large }`.

## voice tooling (amazon vs elevenlabs)

**Verdict: voice is cheap at hobby scale.** At ~30 min/month, AWS Polly Standard is
about **$0.11** of generated speech (Neural ~$0.43); Transcribe adds ~$0.30 only if
the bot also transcribes 30 min of incoming audio. Both fit their first-year free
allowances (Polly per-engine caps; Transcribe 60 min/mo). ElevenLabs sounds better
and more expressive, but its entry subscription is **$6/mo** — the minimum
predictable paid spend, not a requirement for a few minutes.

Assumptions: ~150 spoken words/min ≈ 900 text chars/min → hobby 27k chars,
5 h → 270k, 50 h → 2.7M.

| usage     | Polly Standard | Polly Neural | ElevenLabs Flash API | ElevenLabs Multilingual API |
| --------- | -------------: | -----------: | -------------------: | --------------------------: |
| 30 min/mo |          $0.11 |        $0.43 |                $1.35 |                       $2.70 |
| 5 h/mo    |          $1.08 |        $4.32 |               $13.50 |                         $27 |
| 50 h/mo   |         $10.80 |       $43.20 |                 $135 |                        $270 |

Rates: Polly $4/$16 per 1M chars; ElevenLabs API $0.05/$0.10 per 1k chars.
ElevenLabs plans: Free 10k credits ≈ 11 min (or ~22 min at Flash half-credit),
Starter $6/30k (Instant Voice Cloning), Creator $22/121k (Professional Cloning;
promo prices fluctuate). API pay-as-you-go is dollar-based, separate from plan
credits. STT: Eleven Scribe ~$0.22/audio-h ($0.39 realtime); AWS Transcribe
US-East $0.006/min batch, $0.01/min streaming (region-dependent).

`@discordjs/voice` accepts Readable streams → provider audio can stream straight
into playback (or cache file-then-play for retry simplicity). Perceived latency =
first-byte + buffering + transcoding, not just the model's generation claim.

Alternatives sanity check: OpenAI TTS is token-priced (check current model rate);
PlayHT is plan-dependent; Piper is local/free-per-request but costs host CPU.
**Bottom line: Polly is not expensive; ElevenLabs is the premium quality option,
its $6/mo plan already ample for low volume.**

Caveats: estimates are usage-only (no hosting/egress/taxes); real volume depends
on bot design (responses vs continuous narration); Bun + `@discordjs/voice`
compatibility is unproven — spike it before committing.

## what people actually run (2025–2026)

- **Baseline bots are utilities, not assistants.** MEE6, Dyno, Carl-bot sell
  moderation/roles/logging/onboarding; their scale (claimed millions of servers)
  dwarfs the recap-bot category ([MEE6](https://mee6.xyz/), [Dyno](https://dyno.gg/bot),
  [Carl-bot](https://carl.gg/)).
- **Recap/search is a real surface but not a proven study-server norm.** Discord
  itself experiments with in-channel topic summaries; bots offer `/catchup`,
  scheduled digests, cited follow-ups, `/ask` — e.g. Summary Bot (792 servers,
  self-report) ([Discord experiment](https://support.discord.com/hc/en-us/articles/12926016807575-In-Channel-Conversation-Summaries),
  [Summary Bot](https://trysummarybot.com/)).
- **The loved UX is on-demand, private, cited**: catch-up/answers with jump-links,
  permission-aware, opt-out/deletion, visible cost limits. Unsolicited channel
  chatter = the annoyance pattern.
- **Silent note-keeping is unusual and trust-costly.** Our v4 design is the rare
  path — so the notice/consent + retention controls move from "polish" to
  "core constraint" ([Developer Policy](https://discord.com/developers/docs/policies-and-agreements/developer-policy)).
- **Raw per-channel rows validated**: no standard memory stack exists — patterns
  range from time-window digests to pgvector RAG with maintained summaries
  ([OneLiteFeatherRAGBot](https://github.com/OneLiteFeatherNET/OneLiteFeatherRAGBot),
  [TLDRkseid](https://github.com/LearnedGeek/Discord-TLDRkseid),
  [discord-ai-digest](https://github.com/simonindelicate/discord-ai-digest)).
  Defer embeddings/rollups until retrieval needs demand them.

Takeaway for v4: keep the design; if a user-facing surface ever appears, it's a
**private** `/catchup` or `/ask` with source links — never unprompted posts.

## storage & memory (postgres) — v1

One `messages` table, migration-managed. `discord_id UNIQUE` + `ON CONFLICT DO
NOTHING` makes re-ingestion idempotent.

```sql
CREATE TABLE messages (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  guild_id     TEXT NOT NULL,
  channel_id   TEXT NOT NULL,
  discord_id   TEXT NOT NULL UNIQUE,
  author_id    TEXT NOT NULL,
  author_name  TEXT NOT NULL,
  content      TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL
);
CREATE INDEX messages_channel_time_idx ON messages (channel_id, created_at DESC);
```

- retrieval: `WHERE channel_id = $1 AND created_at >= now() - interval '24 hours'
ORDER BY created_at` — short memory is exactly this; large memory is the same
  query without the cutoff. Bound rows/prompt size.
- scale: 200–5k rows/day at study-server size — no partitioning, no cache,
  no partitioning “just in case”
- open before real data flows: **retention policy** + **edit/delete handling**
  (edited messages: upsert or version; deletions: purge or tombstone)
- summaries later (if ever): separate table, watermark-based idempotent job —
  never moving/deleting raw rows

## rag ladder (decided, deferred — only when `/ask` is real)

Fact-checked against opencode's source (grep.ts / lsp.ts / providers docs):
**opencode has no embeddings or RAG** — codebase context is grep + LSP + context
stuffing. Its provider layer IS `@ai-sdk/openai-compatible` (the Vercel AI SDK —
right layer, no embedding stack behind it). Local no-Ollama paths it supports:
LM Studio (`127.0.0.1:1234/v1`), llama.cpp `llama-server` (`127.0.0.1:8080/v1`).

Ladder, simplest first:

1. **Postgres full-text search (`tsvector`)** — zero new infra, native SQL.
   Try this first; a study server's recall may not need vectors at all.
2. **pgvector + AI SDK `embed()`** — layer DECIDED (AI SDK, no Ollama); the
   backend-base postgres image already ships pgvector (reuse that Dockerfile when
   we get here). Model: hosted `text-embedding-3-small` for least ops, or local transformers.js/ONNX when message locality is required (trust constraint).
   llama.cpp server = valid local no-Ollama path.
3. RAG frameworks — never; retrieval is `ORDER BY embedding <=> $1 LIMIT k`.
   Store model id + dimension with vectors so re-embedding stays manageable.

`/ask` answer generation rides the same AI SDK layer (streaming, swappable).

## extraction from backend-base

| take                                                                                                               | why               |
| ------------------------------------------------------------------------------------------------------------------ | ----------------- |
| compose shape: `${POSTGRES_PASSWORD}`, named volume, `expose: 5432` (no published port; `127.0.0.1:5432` dev-only) | conventions match |
| env convention: `.env` secrets → app reads `DATABASE_URL` + `DISCORD_TOKEN`                                        | same as template  |

| skip                                          | why                                                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `postgres/Dockerfile` + `init-extensions.sql` | it's `postgres:18` + pgvector + PostGIS — embeddings/geo kit out of scope; use stock `postgres:18` |
| `valkey/`, `seaweedfs/`                       | cache + object storage: no use here                                                                |
| `.railway`, template `package.json`           | template metadata; the bot owns its package                                                        |

Compose: single postgres service, stock image, volume, healthcheck (`pg_isready`).

## proposed skeleton (from npm-cli-base + official guide)

```
src/index.ts        entry: client + login (bun/node shebang — after the spike)
src/client.ts       client construction, minimal intents, command registry
src/deploy-commands.ts  one-shot REST registration (guild route in dev)
src/commands/       (empty for v1 — no user-facing commands)
src/events/         messageCreate (the whole feature), ready, interactionCreate
src/helpers/        errors/text helpers + specs (npm-cli-base)
src/db/schema.sql   messages table + index (single migration)
src/db/messages.ts  record() / context() / recent() — the whole memory API
```

Tooling unchanged: oxlint + oxfmt --check + tsc --noEmit, vitest.

## next steps

1. **Bun spike first** (researcher's gate): `/ping` slash command end-to-end +
   force a network interruption and confirm resume — decides bun vs node shebang
2. ~~decide the bot's job~~ — done: per-channel message store, window-based memory (v4)
3. create the app in the portal (enable **Message Content** intent), token + invite
4. scaffold from npm-cli-base + `bun add discord.js` (no community template);
   add `ai` + `@ai-sdk/openai-compatible` when retrieval lands
5. ship `/ping` before any feature, then the message → `messages` table loop
6. decide retention + edit/delete + **notice/consent model** before real data flows
7. first user-facing surface if ever: private `/catchup` or `/ask` with jump-links
   (retrieval ladder above — full-text search first, embeddings only if recall
   disappoints)
8. voice spike only if audio comes back into scope
