import { expect, it, vi } from "vitest";

it("keeps Discord input isolated from local Pi resources and file tools", async () => {
  vi.stubEnv("AI_API_KEY", "test-key");
  const { createChannelSession } = await import("../spike/embed-pi.ts");
  const replies: string[] = [];
  const embedded = await createChannelSession({
    channelId: "test-channel",
    model: "qwen/qwen3.7-flash",
    onReply: async (text) => {
      replies.push(text);
    },
  });
  try {
    expect(embedded.session.getActiveToolNames()).toEqual(["respond_in_discord"]);
    expect(embedded.session.systemPrompt).not.toContain("OTTER-WEARS-A-HARDHAT-42");
    expect(embedded.session.systemPrompt).not.toContain("AGENTS.md");
    expect(embedded.session.systemPrompt).not.toContain("Salvadoranismos");
    expect(replies).toEqual([]);
  } finally {
    embedded.dispose();
    vi.unstubAllEnvs();
  }
});
