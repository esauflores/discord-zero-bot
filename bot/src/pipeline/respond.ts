import {
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  createAgentSession,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { Message } from "discord.js";

import { getResponseModel } from "@/infra/ai.ts";
import { reactToMessage, respondInDiscord } from "@/tools/discord-actions.ts";
import { generateImageTool } from "@/tools/generate-image.ts";
import { readChat } from "@/tools/read-chat.ts";
import { webSearch } from "@/tools/search-web.ts";

import { addPdfs, loadAttachments } from "./attachments.ts";
import type { Effect } from "./effects.ts";
import { systemPrompt } from "./prompt.ts";

type RespondInput = {
  message: Message;
  effects: Effect[];
  state: { imageRequested: boolean };
  promptText: string;
};

/** One isolated Pi run per addressed Discord message. */
export async function respond(input: RespondInput): Promise<{ steps: number }> {
  const { modelRuntime, model } = await getResponseModel();

  let calls = 0;
  const tools: ToolDefinition[] = [
    respondInDiscord(input.effects),
    readChat(input.message),
    reactToMessage(input.effects),
    generateImageTool(input.message, input.state),
    webSearch(input.message),
  ];
  for (const tool of tools) {
    const execute = tool.execute.bind(tool);
    tool.execute = (id, params, signal, onUpdate, toolContext) => {
      if (++calls > 6) throw new Error("Pi tool-call limit reached (6)");
      return execute(id, params, signal, onUpdate, toolContext);
    };
  }

  const cwd = process.cwd();
  const settingsManager = SettingsManager.inMemory({
    httpIdleTimeoutMs: 30_000,
    retry: { enabled: false },
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: cwd,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt,
    appendSystemPrompt: [],
  });
  await resourceLoader.reload();
  const { session } = await createAgentSession({
    cwd,
    agentDir: cwd,
    model,
    modelRuntime,
    resourceLoader,
    settingsManager,
    sessionManager: SessionManager.inMemory(cwd),
    tools: tools.map((tool) => tool.name),
    customTools: tools,
  });
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    void session.abort().catch((error: unknown) => console.error("Pi abort failed:", error));
  }, 120_000);
  try {
    await session.bindExtensions({});
    const attachments = await loadAttachments(input.message);
    if (attachments.pdfs.length)
      session.agent.onPayload = (payload) => {
        addPdfs(payload, attachments.pdfs);
      };
    await session.prompt(
      `${input.promptText}\n\nAttachment input status:\n${attachments.notes.join("\n") || "No supported attachment contents supplied."}`,
      {
        expandPromptTemplates: false,
        ...(attachments.images.length ? { images: attachments.images } : {}),
      },
    );
    if (timedOut) throw new Error("Pi response timed out (120s)");
    if (calls > 6) throw new Error("Pi tool-call limit reached (6)");
    const assistants = session.messages.filter((entry) => entry.role === "assistant");
    const last = assistants.at(-1);
    const hasFinalText = last?.content?.some((part) => part.type === "text" && part.text.trim().length > 0) ?? false;
    console.log(
      `[pi] #${input.message.channelId} message ${input.message.id} stop=${last?.stopReason ?? "none"} toolCalls=${calls} finalText=${hasFinalText} effects=${input.effects.length} imageRequested=${input.state.imageRequested}`,
    );
    if (last?.stopReason === "error" || last?.stopReason === "aborted")
      throw new Error(last.errorMessage ?? `Pi response ${last.stopReason}`);
    return { steps: assistants.length };
  } finally {
    clearTimeout(deadline);
    session.dispose();
  }
}
