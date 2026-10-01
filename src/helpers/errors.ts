// error plumbing

export function die(msg: string): never {
  console.error(`zero-discord-bot: ${msg}`);
  process.exit(1);
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
