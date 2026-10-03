FROM oven/bun:1.4.2
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile
COPY bot ./bot
ENV SQLITE_PATH=/data/messages.sqlite
CMD ["bun", "--smol", "run", "bot/src/index.ts"]
