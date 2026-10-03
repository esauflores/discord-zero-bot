# discord-zero-bot

Small personal-server Discord bot running on Bun, discord.js, Pi's agent SDK, OpenRouter, and SQLite. Keep it small; no new services or dependencies without a demonstrated need. Parent workspace instructions still apply.

## Commands

- Install: `bun install`
- Run locally: `bun --env-file=.env run start`
- Validate: `bun run check`
- Test: `bun run test` (Vitest plus Bun SQLite smoke check)
- Deploy: `docker compose up -d --build`

Never read or expose `.env` secrets. Use `.env.example` for configuration documentation. Tests require no live credentials; do not make paid API calls to verify changes.

## Code map

- `bot/src/index.ts`: Discord client, message listener, shutdown.
- `bot/src/pipeline/index.ts`: scope filtering → record → classify → enrich → respond → deliver.
- `bot/src/pipeline/classify.ts`: Jev classification with direct-mention/name fallback on API failure.
- `bot/src/pipeline/respond.ts`: isolated in-memory Pi session with an allowlisted toolset.
- `bot/src/pipeline/effects.ts`: queue and deliver one text reply and one reaction per message.
- `bot/src/pipeline/tasks.ts`: process-local background task tracking per channel.
- `bot/src/infra/`: OpenRouter calls, SQLite persistence, message snapshots.
- `bot/src/tools/`: Discord actions, channel history, Brave search, background image generation.
- `bot/tests/`: mocked API/Discord checks and a real temporary SQLite smoke check.
- `bot/spike/`: experiments, not production code.
- `docs/architecture.json`: diagram source; `docs/architecture.html`: generated interactive viewer; `docs/architecture.png`: README image.

## Settled behavior

- Guild/channel filters apply before both storage and responses. Ignore other bots; record this bot's own messages without responding to them.
- Retain the latest 1,000 messages globally; use the latest 10 channel messages for context. Queries are parameterized and history tools are channel-scoped.
- Incoming attachments are metadata-only. Do not download, analyze, transcribe, or claim to read their contents.
- Final model text is never published. Text and reactions go through explicit tools and centralized delivery.
- Generated mentions are intentionally allowed on this personal server. Do not change that policy unrequested.
- Reaction validation rejects empty input; Discord validates the emoji. Do not reintroduce Unicode character-count limits.
- At most six tool calls per response. Request Pi cancellation after 120 seconds; this is not a hard completion guarantee. No extra timeout infrastructure is wanted.
- Jev API timeout: 8 seconds. Brave search timeout: 10 seconds. Image API timeout: 90 seconds.
- One background image task per channel; reject further image requests while busy. Other channels and text replies continue. Image results/failures reply directly to Discord, not to Pi. Tasks do not survive restart; do not add a durable queue speculatively.

## Change discipline

Read the actual flow and callers before editing. Prefer existing helpers, native APIs, and deletion over abstractions. Add or update the smallest regression check for changed logic; run `bun run check` and `bun run test` after code changes.

The working tree may contain user changes: preserve them and never reset unrelated files. Do not commit or deploy unless asked.

The Docker build context is the repository root. `bot/Dockerfile.dockerignore` applies to this Dockerfile and takes precedence over the root `.dockerignore`; keep secret/dependency exclusions when changing it.

Keep README and architecture artifacts consistent with runtime behavior. Use Archify for diagram changes, validate the source, and regenerate HTML; never hand-edit generated HTML. Refresh the PNG when changing the diagram rather than claiming an old export is current.
