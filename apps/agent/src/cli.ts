/**
 * Run the agent from the terminal:
 *   MOCK_API=1 pnpm agent "buy notebooks and milk for this week"
 *
 * In mock mode, held carts ask you to approve right here in the terminal.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { runAgent } from "./agent.js";
import { config, llmConfigured, llmKeyVar } from "./config.js";
import { defaultClient, MockMandateClient } from "./mandateClient.js";

const request = process.argv.slice(2).join(" ") || "Buy notebooks and milk for this week";

if (!llmConfigured()) {
  console.error(`No API key for ${config.llmProvider}. Set ${llmKeyVar()} in apps/agent/.env (or OPENROUTER_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY with LLM_PROVIDER to match)`);
  process.exit(1);
}

const client = defaultClient();
const rl = createInterface({ input: stdin, output: stdout });

const result = await runAgent({
  request,
  client,
  onEvent: async (e) => {
    const icon = { check: e.decision === "allow" ? "OK " : e.decision === "block" ? "XX " : "?? ", approval: ".. ", payment: "$$ ", dispute: "!! ", agent: "-- " }[e.type];
    console.log(`${icon}${e.summary}`);
    if (e.type === "approval" && e.summary.startsWith("Waiting") && client instanceof MockMandateClient) {
      const pending = [...client.approvals].find(([, s]) => s === "pending");
      if (pending) {
        const answer = await rl.question("   Approve this purchase? (y/n) ");
        client.resolve(pending[0], answer.trim().toLowerCase().startsWith("y"));
      }
    }
  },
});

console.log(`\nAgent: ${result.text}`);
rl.close();
