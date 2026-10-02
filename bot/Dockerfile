FROM oven/bun:1.4.2
WORKDIR /app

COPY package.json bun.lock ./
COPY bot/package.json bot/package.json
COPY database/package.json database/package.json
COPY storage/package.json storage/package.json
RUN bun install --frozen-lockfile --production
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*

COPY bot/src bot/src
COPY database/src database/src
COPY storage/src storage/src
USER bun
CMD ["bun", "run", "bot/src/index.ts"]
