/** Inspects what Pi actually puts in the session: token usage and leaked context. */
import { createChannelSession } from "./embed-pi.ts";

const { session, prompt } = await createChannelSession({
  channelId: "spike",
  model: process.env.SPIKE_MODEL ?? "qwen/qwen3.7-flash",
  onReply: async (text) => console.log(`would post: ${text.slice(0, 80)}`),
});
try {
  const sp = session.systemPrompt ?? "";
  // Would our AGENTS.md leak in? Check its distinctive canary and rules.
  console.log(`systemPrompt chars=${sp.length}`);
  console.log(`  contains CANARY ("OTTER-WEARS-A-HARDHAT-42"): ${sp.includes("OTTER-WEARS-A-HARDHAT-42")}`);
  console.log(`  contains "AGENTS.md" mention: ${sp.includes("AGENTS.md")}`);
  console.log(`  contains Project workspace text: ${sp.includes("Projects/active") || sp.includes("Bundled skills")}`);
  console.log(`  contains our Salvadoran persona ("Salvadoranismos"): ${sp.includes("Salvadoranismos")}`);
  await prompt("buenos dias");
  const msgs = session.messages as { role?: string; usage?: Record<string, unknown> }[];
  const withUsage = msgs.filter((m) => m.usage);
  console.log(`\nmessages=${msgs.length}, with usage=${withUsage.length}`);
  for (const m of withUsage) console.log(`  usage: ${JSON.stringify(m.usage)}`);
} finally {
  session.dispose();
}
