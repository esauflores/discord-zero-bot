import { describe, expect, it } from "vitest";

import { summaryWindow } from "./summarize-window.ts";

const message = (time: string) => ({ created_at: new Date(time) });

describe("summaryWindow", () => {
  it("resumes strictly after the persisted watermark after restart", () => {
    const watermark = new Date("2025-01-01T01:00:00Z");
    const through = new Date("2025-01-01T02:00:00Z");
    const window = summaryWindow(
      [message("2025-01-01T01:00:00Z"), message("2025-01-01T01:30:00Z")],
      watermark,
      through,
    );

    expect(window?.messages).toHaveLength(1);
    expect(window?.from).toEqual(new Date("2025-01-01T01:30:00Z"));
    expect(window?.to).toEqual(through);
  });

  it("returns no window when no messages fall inside it", () => {
    expect(
      summaryWindow([message("2025-01-01T01:00:00Z")], undefined, new Date("2025-01-01T00:00:00Z")),
    ).toBeUndefined();
  });

  it("includes the through boundary and excludes the previous watermark", () => {
    const after = new Date("2025-01-01T01:00:00Z");
    const through = new Date("2025-01-01T02:00:00Z");
    const window = summaryWindow([message(after.toISOString()), message(through.toISOString())], after, through);

    expect(window?.messages).toHaveLength(1);
    expect(window?.messages[0]?.created_at).toEqual(through);
  });
});
