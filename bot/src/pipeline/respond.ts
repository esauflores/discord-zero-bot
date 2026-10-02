import {
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  createAgentSession,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { ToolExecutionOptions } from "ai";
import type { Message } from "discord.js";
import { spawn } from "node:child_process";
import { Type } from "typebox";

import { generateImageTool } from "@/tools/generate-image.ts";
import { openAttachment } from "@/tools/open-attachment.ts";
import { reactToMessage } from "@/tools/react-message.ts";
import { readChat } from "@/tools/read-chat.ts";
import { respondInDiscord } from "@/tools/respond-discord.ts";
import { webSearch } from "@/tools/search-web.ts";

import type { Effect } from "./effects.ts";
import { systemPrompt } from "./prompt.ts";

const toolResult = (text: string) => ({ content: [{ type: "text" as const, text }], details: {} });
const toolOptions = (toolCallId: string, abortSignal?: AbortSignal): ToolExecutionOptions<Record<string, unknown>> => ({
  toolCallId,
  messages: [],
  abortSignal,
  context: {},
});
const runtime = ModelRuntime.create({ modelsPath: null, authPath: "/dev/null" });
const pdfText = (bytes: Buffer): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn("pdftotext", ["-", "-"], { stdio: ["pipe", "pipe", "pipe"] });
    let text = "";
    let error = "";
    const timer = setTimeout(() => child.kill(), 15_000);
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      text += chunk;
      if (text.length > 100_000) child.kill();
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (error += chunk));
    child.on("error", reject);
    child.stdin.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(text);
      else reject(new Error(error || `pdftotext exited ${code}`));
    });
    child.stdin.end(bytes);
  });
const completed = async <T>(result: T | AsyncIterable<T>): Promise<T> => {
  if (!result || typeof result !== "object" || !(Symbol.asyncIterator in result)) return result;
  let last: T | undefined;
  for await (const part of result) last = part;
  if (last === undefined) throw new Error("Tool returned no result");
  return last;
};

type RespondInput = {
  message: Message;
  model: string;
  effects: Effect[];
  state: { imageRequested: boolean };
  promptText: string;
  promptFiles: { url: string; mediaType: string }[];
};

/** One isolated Pi run per addressed Discord message; channel history comes from the prompt/read_chat. */
export async function respond(input: RespondInput): Promise<{ modelText: string; steps: number }> {
  const key = process.env.AI_API_KEY;
  if (!key) throw new Error("AI_API_KEY is required");
  const modelRuntime = await runtime;
  await modelRuntime.setRuntimeApiKey("openrouter", key);
  const model = modelRuntime.getModel("openrouter", input.model);
  if (!model) throw new Error(`Model not found in registry: openrouter/${input.model}`);

  const { message } = input;
  let calls = 0;
  const tools: ToolDefinition[] = [
    {
      name: "respond_in_discord",
      label: "Respond in Discord",
      description: "Reply to this Discord message. Call only when you want to speak; otherwise stay silent.",
      parameters: Type.Object({ text: Type.String({ description: "Reply text (up to 2000 characters)" }) }),
      execute: async (id, { text }, signal) =>
        toolResult(await completed(respondInDiscord(input.effects).execute({ text }, toolOptions(id, signal)))),
    },
    {
      name: "read_chat",
      label: "Read chat",
      description:
        "Read recent and related older channel messages, including attachment names. Use open_attachment to read one.",
      parameters: Type.Object({ query: Type.String({ description: "Search query" }) }),
      execute: async (id, { query }, signal) =>
        toolResult(await completed(readChat(message).execute({ query }, toolOptions(id, signal)))),
    },
    {
      name: "open_attachment",
      label: "Open attachment",
      description: "Open a saved attachment from this channel by filename; empty name lists saved attachments.",
      parameters: Type.Object({
        name: Type.String({ description: "Filename or part of it; empty lists attachments" }),
      }),
      execute: async (id, { name }, signal) => {
        const result = await completed(openAttachment(message).execute({ name }, toolOptions(id, signal)));
        return {
          content: await Promise.all(
            result.parts.map(async (part) => {
              if (part.type === "text") return part;
              const bytes = Buffer.from(part.data.data);
              if (part.mediaType.startsWith("image/"))
                return { type: "image" as const, data: bytes.toString("base64"), mimeType: part.mediaType };
              if (part.mediaType.startsWith("text/"))
                return { type: "text" as const, text: bytes.toString("utf8").slice(0, 100_000) };
              if (part.mediaType === "application/pdf") {
                try {
                  const text = await pdfText(bytes);
                  return { type: "text" as const, text: text || `${part.filename}: empty PDF.` };
                } catch {
                  return { type: "text" as const, text: `${part.filename}: could not extract PDF text.` };
                }
              }
              return { type: "text" as const, text: `${part.filename}: ${part.mediaType} cannot be read by Pi.` };
            }),
          ),
          details: {},
        };
      },
    },
    {
      name: "react",
      label: "React",
      description: "Add one emoji reaction to the current message, only when warranted.",
      parameters: Type.Object({ emoji: Type.String({ description: "Single emoji" }) }),
      execute: async (id, { emoji }, signal) =>
        toolResult(await completed(reactToMessage(input.effects).execute({ emoji }, toolOptions(id, signal)))),
    },
    {
      name: "generate_image",
      label: "Generate image",
      description: "Start image generation in the background; the image is sent to Discord when ready.",
      parameters: Type.Object({ prompt: Type.String({ description: "Detailed image description" }) }),
      execute: async (id, { prompt }, signal) =>
        toolResult(
          await completed(generateImageTool(message, input.state).execute({ prompt }, toolOptions(id, signal))),
        ),
    },
    {
      name: "web_search",
      label: "Web search",
      description: "Search the web for external research.",
      parameters: Type.Object({ query: Type.String({ description: "Search query" }) }),
      execute: async (id, { query }, signal) =>
        toolResult(await completed(webSearch(message).execute({ query }, toolOptions(id, signal)))),
    },
  ];
  for (const tool of tools) {
    const execute = tool.execute.bind(tool);
    tool.execute = (id, params, signal, onUpdate, toolContext) => {
      if (++calls > 6) throw new Error("Pi tool-call limit reached (6)");
      return execute(id, params, signal, onUpdate, toolContext);
    };
  }
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
    systemPrompt: `${systemPrompt}\nEste mensaje fue clasificado como dirigido a vos. Respondé naturalmente usando respond_in_discord; si piden una imagen, usá generate_image; si el mensaje trae un archivo o hay uno anterior que necesitás, usá open_attachment; podés reaccionar con react. Tu texto final no se publica.`,
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
  try {
    await session.bindExtensions({});
    const images = await Promise.all(
      input.promptFiles
        .filter((file) => file.mediaType.startsWith("image/"))
        .map(async (file) => {
          const url = new URL(file.url);
          if (url.protocol !== "https:" || !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname))
            throw new Error(`Unexpected Discord attachment host: ${url.hostname}`);
          const response = await fetch(url, { redirect: "error" });
          if (!response.ok) throw new Error(`Cannot fetch Discord image: ${response.status}`);
          return {
            type: "image" as const,
            data: Buffer.from(await response.arrayBuffer()).toString("base64"),
            mimeType: file.mediaType,
          };
        }),
    );
    const files = input.promptFiles
      .filter((file) => !file.mediaType.startsWith("image/"))
      .map((file) => `Attachment (${file.mediaType}): use open_attachment to inspect it.`)
      .join("\n");
    await session.prompt(`${input.promptText}\n${files}`, { images, expandPromptTemplates: false });
    if (calls > 6) throw new Error("Pi tool-call limit reached (6)");
    const assistants = session.messages.filter((entry) => entry.role === "assistant");
    const last = assistants.at(-1);
    if (last?.stopReason === "error" || last?.stopReason === "aborted")
      throw new Error(last.errorMessage ?? `Pi response ${last.stopReason}`);
    return { modelText: session.getLastAssistantText() ?? "", steps: assistants.length };
  } finally {
    session.dispose();
  }
}
