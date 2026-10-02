/**
 * Phase-1 embed of Pi's SDK: a fresh, isolated AgentSession for a Discord channel probe.
 *
 * This exists to MEASURE, not to ship. It answers one question: does a Pi session
 * with an allowlisted toolset stay within latency and token budget for a study
 * server, compared with the current pipeline (measured 12.4s / ~900 reasoning
 * tokens for "buenos dias").
 *
 * Spike code: not wired into the event handler.
 */
import {
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  createAgentSession,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

function apiKey(): string {
  const key = process.env.AI_API_KEY;
  if (!key) throw new Error("AI_API_KEY is required");
  return key;
}

export async function createChannelSession(options: {
  channelId: string;
  model: string;
  onReply?: (text: string) => Promise<void>;
}) {
  const cwd = process.cwd();

  const settingsManager = SettingsManager.inMemory();
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: cwd,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "You are a participant in a Discord channel. Reply only through respond_in_discord.",
    appendSystemPrompt: [],
  });
  await resourceLoader.reload();

  const modelRuntime = await ModelRuntime.create();
  // The SDK keeps its own credential store, so hand it our key at runtime rather
  // than relying on OPENROUTER_API_KEY being picked up.
  await modelRuntime.setRuntimeApiKey("openrouter", apiKey());
  const model = modelRuntime.getModel("openrouter", options.model);
  if (!model) throw new Error(`Model not found in registry: openrouter/${options.model}`);

  const replyTool = {
    name: "respond_in_discord",
    label: "Respond in Discord",
    description: "Post a reply to the Discord channel. Call only when you want to speak.",
    parameters: Type.Object({ text: Type.String({ description: "Reply text" }) }),
    execute: async (_id: string, params: { text: string }) => {
      const text = params.text.trim();
      if (!text) return { content: [{ type: "text" as const, text: "Empty reply ignored." }], details: {} };
      await options.onReply?.(text.slice(0, 2000));
      return { content: [{ type: "text" as const, text: "Reply sent." }], details: {} };
    },
  };

  const { session } = await createAgentSession({
    cwd,
    model,
    modelRuntime,
    resourceLoader,
    tools: ["respond_in_discord"],
    customTools: [replyTool],
    sessionManager: SessionManager.inMemory(cwd),
    settingsManager,
    agentDir: cwd,
  });
  await session.bindExtensions({});

  return {
    session,
    prompt: async (text: string) => {
      await session.prompt(text);
      return session.getLastAssistantText() ?? "";
    },
    dispose: () => session.dispose(),
  };
}
