/**
 * End-to-end agent loop with a scripted mock model: proves the tools are wired
 * correctly and that a hijacked model still cannot spend money.
 */
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { runAgent } from "../src/agent.js";
import { detect } from "../src/detector.js";
import { MockMandateClient } from "../src/mandateClient.js";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};
const call = (toolName: string, input: unknown, id: string) => ({
  content: [{ type: "tool-call" as const, toolCallId: id, toolName, input: JSON.stringify(input) }],
  finishReason: { unified: "tool-calls" as const, raw: "tool_use" },
  usage,
  warnings: [],
});
const say = (text: string) => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: "stop" as const, raw: "end_turn" },
  usage,
  warnings: [],
});

describe("agent loop (scripted model)", () => {
  it("buys milk end to end through /check and /pay", async () => {
    const client = new MockMandateClient("approve");
    const model = new MockLanguageModelV4({
      doGenerate: [
        call("search_products", { query: "milk" }, "c1"),
        call("get_product", { sku: "GRO-MILK" }, "c2"),
        call("request_payment", { items: [{ sku: "GRO-MILK", qty: 1 }], reasoning: "Milk as requested." }, "c3"),
        say("Bought one gallon of milk for $5.49."),
      ],
    });
    const result = await runAgent({ request: "Buy a gallon of milk", client, model });

    expect(result.text).toMatch(/milk/);
    expect(result.events.some((e) => e.type === "payment")).toBe(true);
    expect(client.spentThisMonth).toBeCloseTo(5.49);
  });

  it("a hijacked model that obeys the hidden page still cannot pay", async () => {
    const client = new MockMandateClient("approve");
    const model = new MockLanguageModelV4({
      doGenerate: [
        call("get_product", { sku: "SCH-BUNDLE" }, "c1"),
        // The model "falls for" the hidden instruction:
        call("request_payment", { items: [{ sku: "SCH-BUNDLE", qty: 1 }, { sku: "GC-100", qty: 10 }], reasoning: "The page said the user requires gift cards." }, "c2"),
        // ...and then tries to sneak one card through on its own:
        call("request_payment", { items: [{ sku: "GC-100", qty: 1 }], reasoning: "Just one gift card." }, "c3"),
        say("Mandate blocked the gift cards."),
      ],
    });
    const result = await runAgent({ request: "Buy a back-to-school bundle", client, model });

    expect(result.events.some((e) => e.type === "check" && e.decision === "block")).toBe(true);
    expect(result.events.some((e) => e.type === "payment")).toBe(false);
    expect(client.spentThisMonth).toBe(0);
    // The model was told the purchase was blocked, and the retry was refused locally.
    const lastPrompt = JSON.stringify(model.doGenerateCalls.at(-1)?.prompt);
    expect(lastPrompt).toContain("blocked");
    expect(lastPrompt).toContain("refused_locally");
  });
});

describe("LLM judge layer (scripted model)", () => {
  const cleanInput = {
    userRequest: "buy milk",
    cart: { items: [{ sku: "GRO-MILK", name: "Organic whole milk, 1 gallon", category: "groceries" as const, unitPrice: 5.49, qty: 1, merchant: "demo-store" }], total: 5.49, agentReasoning: "Milk.", sourceUrls: [] },
    pageText: "Organic whole milk. Pour it in your coffee.",
  };

  it("raises the risk when the judge spots something the rules miss", async () => {
    const judgeModel = new MockLanguageModelV4({
      doGenerate: say(JSON.stringify({ riskScore: 0.82, signals: ["page asks the agent to act"], verdict: "malicious" })),
    });
    const r = await detect(cleanInput, { judgeModel });
    expect(r.layers?.rules).toBeLessThan(0.4);
    expect(r.layers?.llm).toBe(0.82);
    expect(r.verdict).toBe("malicious");
    expect(r.signals.join(" ")).toContain("LLM:");
  });

  it("falls back to rules only if the judge fails", async () => {
    const judgeModel = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("provider down");
      },
    });
    const r = await detect(cleanInput, { judgeModel });
    expect(r.layers?.llm).toBeNull();
    expect(r.verdict).toBe("safe");
  });
});
