# discord-zero-bot

A conversational participant for my study Discord server. It records messages
(channel memory) and processes every channel message, but only speaks when
addressed (including Zero, Zerotillo, Zerotillo-bot, or Zero-bot). No slash
commands. Specific bot for my server — not a product.

## how it works

Bun workspaces: `database/` owns the Drizzle schema, Postgres connection, and
query helpers; `storage/` owns the SeaweedFS container and object helpers; `bot/`
uses both and translates Discord messages into records. Each workspace has
its own `tsconfig.json`; root scripts and `docker-compose.yml` tie them together.

Each workspace has one public entry point:

| specifier                    | exports                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ |
| `@discord-zero-bot/database` | connection, schema, and message queries                                  |
| `@discord-zero-bot/storage`  | `bucket`, `upload`, `download`                                           |
| `@discord-zero-bot/bot`      | the Discord runtime (`client`, `runChat`); importing it starts the login |

`bot/src/` is four groups: `events/` accepts Discord events, `pipeline/` owns the
message flow and AI configuration, `media/` processes attachments, and `tools/`
exposes model capabilities. `pipeline/index.ts` spells out the fixed flow directly;
there is no generic stage framework or mutable pipeline context.

Adding a media type (image captions, say) is a `Processor` appended to `processors`
in `media/index.ts`. Tools queue `Effect` values in `pipeline/effects.ts`, whose
`deliver()` function allows at most one reply and one reaction per message.

**boot** (`bot/src/index.ts`): env → postgres (drizzle) → Discord client
(intents: `Guilds` + `GuildMessages` + `MessageContent`) → load events → gateway login. `CHANNEL_IDS`
can restrict both recording and replies to a comma-separated set of channel IDs;
empty means all channels.

**every message** (`bot/src/events/messageCreate.ts`): scope check, then `runChat()`
records the message and archives its media (including our own replies). For user
messages, `pipeline/index.ts` loads the previous 10 messages and asks Jev 1.13
whether to answer; addressed messages get an isolated in-memory Pi session with
recent context, readable attachments, and any background work in the channel.
Both Jev routes currently use `deepseek/deepseek-v4.1-flash`. Direct mentions/replies
always count as addressed. Bot messages are recorded but never answered.
The model can call `respond_in_discord` to speak, `read_chat` for related older history
(including attachment names, types, and sizes), `open_attachment` to read a saved
image, PDF, or text file (even one sent long ago), `react` to add one emoji,
`generate_image` to attach an image in the background, and `web_search`
(Brave Search API; optional `BRAVE_API_KEY`) for external research. If the model answers
with plain text instead of calling `respond_in_discord`, `deliver` still publishes
that text (logged as `text (fallback)`) rather than dropping a real reply.
Logs show when evaluation starts, tools run, and whether
the bot replied or stayed silent, plus a timing line
(`persist=…ms gate=…ms enrich=…ms respond=…ms deliver=…ms total=…ms steps=N`).
Ordinary messages incur only the small
classifier request, not a full chat-model call.
`discord_id` is unique with `onConflictDoNothing`, so redelivered gateway
events never create duplicates.

**media** (`bot/src/media/`): an attachment is downloaded once, stored in SeaweedFS,
then offered to every registered `Processor`. Audio is transcribed
(`whisper-large-v3-turbo`) and the transcript is merged into the message `content`,
so search and the models both see it with no special handling; the original bytes
stay reachable through `storage_key`. Only `audio/*` is handled today — adding image
captions means one processor file and one array entry. A processor that fails is
logged and skipped, so one capability cannot break archiving.

**memory** (`database/src/schema/messages.ts`): Postgres stores the message text/index
fields plus a Discord-shaped JSON snapshot with attachment metadata and
SeaweedFS object keys. Attachment bytes are copied from Discord's CDN to the
private SeaweedFS S3 gateway before the row is inserted. If an upload fails,
the message and attachment metadata are still saved with a null storage key
(and the failure is logged). Existing rows have a null snapshot; edits and
deletions are not synced yet. The bot reads the latest 10 messages and can
search older messages on demand, including their saved attachment metadata.
The unused `summaries` table is no longer in the schema; `bun run --cwd database push`
may remove existing summary rows, so back them up first if needed.

## stack (decided)

| piece           | choice                                        | notes                                                                                          |
| --------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| bot framework   | discord.js v14                                | ecosystem default                                                                              |
| runtime         | bun                                           | spike 2026-10: S1–S4 PASS on bun 1.4.2 — node 24 identical as fallback                         |
| database        | postgres                                      | `bun run --cwd database push`; messages and queries live in `database/src/schema/messages.ts`  |
| storage         | SeaweedFS (private S3 gateway)                | attachment bytes in the `seaweedfs_data` volume; upload/download in `storage/src/index.ts`     |
| AI layer (core) | Pi embed SDK for replies; Jev for routing     | OpenRouter: DeepSeek V4.1 Flash answers all addressed messages; Jev still gates and classifies |
| tooling         | oxlint + oxfmt --check + tsc --noEmit, vitest | `bun run check`                                                                                |

`AI_API_KEY` is all the AI layer needs: OpenRouter is the only endpoint. Pi runs
one isolated, in-memory answering session per addressed message; channel history
comes from the database, not Pi session persistence. PDF text extraction requires
`pdftotext` (installed in the bot image); PDFs without extractable text cannot be read.
AI endpoints, model IDs, and classification live together in
`bot/src/pipeline/ai.ts`. Address detection and model routing use the
[Jev Decisions API](https://openrouter.ai/docs/guides/community/jev-tutorial)
(`typesafe/jev-1.13`); local OpenAI-compatible servers do not offer this endpoint
or the pinned models. On Jev failure, direct mentions/replies and name calls still
work using DeepSeek, but contextual follow-ups cannot be detected. Image generation
uses OpenRouter's `/api/v1/images/generations` endpoint with `meta/muse-image`; ask
the bot to generate an image and it may use
`generate_image`. Generation is billed separately (Muse Image is listed from
$0.01/image). See [Muse Image on OpenRouter](https://openrouter.ai/meta/muse-image).

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
- no standard memory stack exists; raw messages stay the source of truth until
  retrieval needs prove otherwise
- platform policy: app verification past 100 guilds; privileged-intent review at
  10k accessible users; Message Content intent is privileged and we need it
- voice (parked): Polly ≈ $0.11/30 min, ElevenLabs from $6/mo; `@discordjs/voice`
  accepts streams — revisit only if audio returns to scope
- hosting when deployed: Fly ≈ $1.94/mo, Railway $5, Render Starter $7 —
  never free tiers (they spin down)

## setup

```bash
cp .env.example .env
docker compose up -d database storage
bun install
bun run --cwd database push
docker compose up -d --build bot
```

Portal: developer.discord.com → app → **Bot** → token + enable the **Message
Content** intent (privileged — separate from the invite). **Installation** → Guild
Install → scope `bot` is all that's needed (`applications.commands` ships with it
by default; this bot has no commands). Minimal permissions: View Channels, Read
Message History, Send Messages, Send Messages in Threads (+ Embed Links / Attach
Files only if used). Invite URL shape:

```text
https://discord.com/oauth2/authorize?client_id=APPLICATION_ID&scope=bot&permissions=274878024704
```

## dev

`bun run dev` · `bun run check` (lint + format + types) · `bun run check:fix` · `bun run --cwd bot test`
