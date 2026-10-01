import { describe, expect, it } from "vitest";

import { errMsg } from "./errors.ts";

describe("errMsg", () => {
  it("extracts the message from errors, stringifies anything else", () => {
    expect(errMsg(new Error("boom"))).toBe("boom");
    expect(errMsg("plain")).toBe("plain");
    expect(errMsg(42)).toBe("42");
  });
});
