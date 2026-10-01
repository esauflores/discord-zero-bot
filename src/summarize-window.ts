export interface TimedMessage {
  created_at: Date;
}

export function summaryWindow<T extends TimedMessage>(
  messages: T[],
  after: Date | undefined,
  through: Date,
): { messages: T[]; from: Date; to: Date } | undefined {
  const consumed = messages.filter(
    (message) => (!after || message.created_at > after) && message.created_at <= through,
  );
  if (consumed.length === 0) return undefined;
  return { messages: consumed, from: consumed[0]!.created_at, to: through };
}
