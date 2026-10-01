import { describe, expect, it } from "vitest";

import { greet } from "./text.ts";

describe("greet", () => {
  it("greets by name", () => {
    expect(greet("world")).toBe("hello, world");
    expect(greet("world", true)).toBe("HELLO, WORLD");
  });
});
