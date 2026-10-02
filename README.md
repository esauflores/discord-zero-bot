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

Every package is reachable by its bare name and by subpath:

| specifier                             | exports                                              |
| ------------------------------------- | ---------------------------------------------------- |
| `@discord-zero-bot/database`          | `db`, `closeDb`                                      |
| `@discord-zero-bot/database/schema`   | the Drizzle tables                                   |
| `@discord-zero-bot/database/client`   | `db`, `closeDb`                                      |
| `@discord-zero-bot/database/messages` | `saveMessage`, `context`, `recent`, `messageColumns` |
| `@discord-zero-bot/database/search`   | `searchMemory`                                       |
| `@discord-zero-bot/storage`           | `bucket`, `upload`, `download`                       |
| `@discord-zero-bot/bot`               | `client`, `runChat` (no login on import)             |

The bot's import route is `bot/src/app.ts`, not `bot/src/index.ts`, because the
latter logs in to Discord as a side effect; runtime startup stays in `index.ts`.

Runtime spike (2026-10) on bun 1.4.2: S1–S4 PASS — client, REST 401, gateway
Hello/4004, clean self-exit. Node 24 behaves identically as a fallback. S5,
network resume after a gateway drop, is still unverified: it needs a real bot
token and tracks bun#2077.

`bot/src/` is five groups: `ai/` holds model IDs and Jev classification; `pipeline/` handles the single message flow and persona; `media/` processes and stores attachments; `tasks/` tracks background jobs; `tools/` exposes model capabilities.

Adding a capability is a `Stage` appended to `chatStages` in `pipeline/index.ts`.
Adding a media type (image captions, say) is a `Processor` appended to `processors`
in `media/index.ts`. `pipeline/deliver.ts` is the only code that writes replies and
reactions to Discord, which is why `tools/` are plain data to assert on: they push
`Effect` values (`pipeline/effects.ts`) that `deliver` executes, allowing at most one
reply and one reaction per message.

**boot** (`bot/src/index.ts`): env → postgres (drizzle) → Discord client
(intents: `Guilds` + `GuildMessages` + `MessageContent`) → load events → gateway login. `CHANNEL_IDS`
can restrict both recording and replies to a comma-separated set of channel IDs;
empty means all channels.

**every message** (`bot/src/events/messageCreate.ts`): scope check, then `runChat()`
through one chain: `persist` records the message and archives its media (including
our own replies), `gate` uses Jev 1.13 and the previous 10 messages to decide whether
to answer, and Pi runs an isolated in-memory session for each addressed message.
Both Jev routes currently use `deepseek/deepseek-v4.1-flash`. Direct mentions/replies
always count as addressed. Bot messages are recorded but never answered.
`enrich` gives the selected model the latest 10 messages, any file it can read
directly, and note of background work already running in the channel.
The model can call `respond_in_discord` to speak, `read_chat` for related older history
(including attachment names, types, and sizes), `open_attachment` to read a saved
image, PDF, or text file (even one sent long ago), `react` to add one emoji,
`generate_image` to attach an image in the background, and `web_search`
(Brave Search API; optional `BRAVE_API_KEY`) for external research. If the model answers
with plain text instead of calling `respond_in_discord`, `deliver` still publishes
that text (logged as `text (fallback)`) rather than dropping a real reply.
Logs show when evaluation starts, tools run, and whether
the bot replied or stayed silent, plus a per-stage timing line
(`gate=…ms enrich=…ms respond=…ms deliver=…ms total=…ms steps=N`).
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

**memory** (`database/src/messages.ts`): Postgres stores the message text/index
fields plus a Discord-shaped JSON snapshot with attachment metadata and
SeaweedFS object keys. Attachment bytes are copied from Discord's CDN to the
private SeaweedFS S3 gateway before the row is inserted. If an upload fails,
the message and attachment metadata are still saved with a null storage key
(and the failure is logged). Existing rows have a null snapshot; edits and
deletions are not synced yet. The bot reads the latest 10 messages and can
search older messages on demand, including their saved attachment metadata.
The unused `summaries` table is no longer in the schema; `bun run db:push` may
remove existing summary rows, so back them up first if needed.

## stack (decided)

| piece           | choice                                        | notes                                                                                          |
| --------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| bot framework   | discord.js v14                                | ecosystem default                                                                              |
| runtime         | bun                                           | spike 2026-10: S1–S4 PASS on bun 1.4.2 — node 24 identical as fallback                         |
| database        | postgres                                      | `bun run db:push`; snapshots defined in `database/src/schema.ts`                               |
| storage         | SeaweedFS (private S3 gateway)                | attachment bytes in the `seaweedfs_data` volume; upload/download in `storage/src/index.ts`     |
| AI layer (core) | Pi embed SDK for replies; Jev for routing     | OpenRouter: DeepSeek V4.1 Flash answers all addressed messages; Jev still gates and classifies |
| tooling         | oxlint + oxfmt --check + tsc --noEmit, vitest | `bun run check`                                                                                |

`AI_API_KEY` is all the AI layer needs: OpenRouter is the only endpoint. Pi runs
one isolated, in-memory answering session per addressed message; channel history
comes from the database, not Pi session persistence. PDF text extraction requires
`pdftotext` (installed in the bot image); PDFs without extractable text cannot be read.
The Jev Decisions API endpoint is hardcoded in `bot/src/ai/models.ts`. Model IDs
live in the same folder. Address detection and model
routing use its [Jev Decisions API](https://openrouter.ai/docs/guides/community/jev-tutorial)
(`typesafe/jev-1.13`); local OpenAI-compatible servers do not offer this endpoint
or the pinned models. On Jev failure, direct mentions/replies and name calls still
work using DeepSeek, but contextual follow-ups cannot be detected. Image reactions
use Qwen. Image generation uses OpenRouter's separate `/api/v1/images` endpoint
with `meta/muse-image`; ask the bot to generate an image and it may use
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
docker compose up -d postgres seaweedfs
bun install
bun run db:push
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

`bun run check` (lint + format + types) · `bun run check:fix` · `bun run test`
