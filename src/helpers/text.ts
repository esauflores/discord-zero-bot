// pure logic — unit-tested, no side effects

export function greet(name: string, upper?: boolean): string {
  const msg = `hello, ${name}`;
  return upper ? msg.toUpperCase() : msg;
}
