import { expect, it, vi } from "vitest";

import { pendingTasks, startTask } from "../src/tasks/index.ts";

it("tracks a running task per channel and reports its age", async () => {
  let finish!: () => void;
  const done = new Promise<void>((resolve) => (finish = resolve));
  startTask("channel", { name: "generate_image", detail: "un gato" }, () => done);

  const [pending] = pendingTasks("channel");
  expect(pending?.task).toEqual({ name: "generate_image", detail: "un gato" });
  expect(pending?.ageMs).toBeGreaterThanOrEqual(0);
  // Another channel is unaffected.
  expect(pendingTasks("other")).toEqual([]);

  finish();
  await vi.waitFor(() => expect(pendingTasks("channel")).toEqual([]));
});

it("clears only its own entry and logs failures", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    let finishFirst!: () => void;
    const first = new Promise<void>((resolve) => (finishFirst = resolve));
    startTask("channel", { name: "first", detail: "a" }, () => first);

    // A second task replaces the first entry; the first must not clear it.
    let finishSecond!: () => void;
    const second = new Promise<void>((resolve) => (finishSecond = resolve));
    startTask("channel", { name: "second", detail: "b" }, () => second);

    finishFirst();
    await vi.waitFor(() => expect(pendingTasks("channel")[0]?.task.name).toBe("second"));

    finishSecond();
    await vi.waitFor(() => expect(pendingTasks("channel")).toEqual([]));

    startTask("channel", { name: "boom", detail: "c" }, () => Promise.reject(new Error("nope")));
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    await vi.waitFor(() => expect(pendingTasks("channel")).toEqual([]));
  } finally {
    error.mockRestore();
  }
});
