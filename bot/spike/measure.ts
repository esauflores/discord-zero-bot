/**
 * Measures Pi-embedded channel sessions against the current pipeline's numbers.
 * Reports wall time, model, active tools, and context size per probe.
 * Run: bun bot/spike/measure.ts   (needs AI_API_KEY)
 */
import { createChannelSession } from "./embed-pi.ts";

const probes = ["buenos dias", "contame un chiste de programadores"];

const { session, prompt } = await createChannelSession({
  channelId: "spike",
  model: process.env.SPIKE_MODEL ?? "qwen/qwen3.7-flash",
  onReply: async (text) => console.log(`      would post: ${text.slice(0, 90)}`),
});

try {
  console.log(`model=${session.model?.provider}/${session.model?.id}`);
  console.log(`thinking=${session.thinkingLevel}`);
  const tools = session.getActiveToolNames();
  console.log(`active tools (${tools.length}): ${tools.join(", ")}`);
  console.log(`system prompt chars=${session.systemPrompt?.length ?? 0}`);
  console.log();

  for (const probe of probes) {
    const started = Date.now();
    const reply = await prompt(probe);
    console.log(`probe=${JSON.stringify(probe)}`);
    console.log(`  wall=${Date.now() - started}ms`);
    console.log(`  reply=${JSON.stringify(reply.slice(0, 100))}`);
    console.log();
  }
} finally {
  session.dispose();
}
