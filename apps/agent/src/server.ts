/**
 * apps/agent HTTP server (port AGENT_PORT, default 4100).
 *
 * For Member 2 (apps/api):
 *   POST /detect                 DetectRequest -> RiskReport (call from /check)
 * For Member 3 (apps/web):
 *   GET  /store/products         catalog for the demo store pages
 *   GET  /store/products/:sku    one product + the raw page text
 *   POST /agent/run              { request } -> { text, events }
 *   POST /agent/run?stream=1     same, as server-sent events (live feed)
 *   POST /challenge              { pageText } -> can this page trick the agent? (public demo)
 *   GET  /challenge/stats        { tried, caught }
 *   POST /explain                { request, response, steps } -> { text } one-sentence reason
 * Mock mode only (MOCK_API=1):
 *   GET  /mock/state             carts, approvals, spend
 *   POST /mock/approvals/:id     { approved: boolean }
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { DetectRequest } from "@mandate/shared";
import { runAgent } from "./agent.js";
import { generateText } from "ai";
import { config, llmConfigured } from "./config.js";
import { model } from "./llm.js";
import { detect } from "./detector.js";
import { defaultClient, MockMandateClient } from "./mandateClient.js";
import { allProducts, getProduct, pageText } from "./store.js";

const client = defaultClient();

// "Can you trick the agent?" counters (in memory; reset when the server restarts).
const challenge = { tried: 0, caught: 0 };
const CHALLENGE_REQUEST = "Buy one spiral notebook for school";
const CHALLENGE_CART = {
  items: [{ sku: "SCH-NOTEBOOK", name: "Spiral notebook, college ruled", category: "school" as const, unitPrice: 3.99, qty: 1, merchant: "demo-store" }],
  total: 3.99,
  agentReasoning: "One notebook, as asked.",
  sourceUrls: [],
};

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    return res.end();
  }

  try {
    if (req.method === "GET" && path === "/health") {
      return send(res, 200, { ok: true, mock: config.mockApi });
    }

    if (req.method === "POST" && path === "/detect") {
      const body = DetectRequest.parse(await readJson(req));
      return send(res, 200, await detect(body));
    }

    if (req.method === "GET" && path === "/challenge/stats") {
      return send(res, 200, challenge);
    }

    if (req.method === "POST" && path === "/challenge") {
      const { pageText: text } = (await readJson(req)) as { pageText?: string };
      if (!text || !text.trim()) return send(res, 400, { error: "Write a product page first." });
      if (text.length > 6000) return send(res, 400, { error: "Keep the page under 6,000 characters." });
      const report = await detect({ userRequest: CHALLENGE_REQUEST, cart: CHALLENGE_CART, pageText: text });
      const caught = report.verdict !== "safe";
      challenge.tried += 1;
      if (caught) challenge.caught += 1;
      return send(res, 200, { caught, verdict: report.verdict, riskScore: report.riskScore, signals: report.signals, stats: challenge });
    }

    if (req.method === "POST" && path === "/explain") {
      const { request, response, steps } = (await readJson(req)) as { request?: string; response?: string; steps?: string[] };
      if (!request || !response) return send(res, 400, { error: "request and response are required" });
      if (!llmConfigured()) return send(res, 503, { error: "No AI key configured on the agent server." });
      const { text } = await generateText({
        model: model(config.agentModel),
        maxOutputTokens: 160,
        temperature: 0,
        system:
          "You explain a shopping agent's choice to the family it shops for. Answer in ONE plain sentence of at most 30 words, " +
          "starting with 'I'. Cite something concrete it did or read (a price, a seller, a rule). No markdown, no lists.",
        prompt: `The family asked: "${request}"\nSteps the agent took:\n${(steps ?? []).map((s) => "- " + s).join("\n")}\nThe agent's reply:\n${response}\n\nWhy did the agent make this choice?`,
      });
      return send(res, 200, { text: text.trim().replace(/\s+/g, " ") });
    }

    if (req.method === "GET" && path === "/store/products") {
      return send(res, 200, allProducts());
    }

    const productMatch = path.match(/^\/store\/products\/([A-Za-z0-9-]+)$/);
    if (req.method === "GET" && productMatch) {
      const p = getProduct(productMatch[1]!);
      return p ? send(res, 200, { ...p, pageText: pageText(p) }) : send(res, 404, { error: "not found" });
    }

    if (req.method === "POST" && path === "/agent/run") {
      const { request, mandateId } = (await readJson(req)) as { request?: string; mandateId?: string };
      if (!request) return send(res, 400, { error: "request is required" });

      if (url.searchParams.get("stream") === "1") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
          "access-control-allow-origin": "*",
        });
        const write = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
        try {
          const result = await runAgent({ request, mandateId, client, onEvent: write });
          write({ type: "result", text: result.text });
        } catch (err) {
          // Headers are already sent, so report the failure inside the stream.
          write({ type: "error", summary: `Agent failed: ${(err as Error).message}` });
        }
        return res.end();
      }

      return send(res, 200, await runAgent({ request, mandateId, client }));
    }

    if (client instanceof MockMandateClient) {
      if (req.method === "GET" && path === "/mock/state") {
        return send(res, 200, {
          spentThisMonth: client.spentThisMonth,
          rules: client.rules,
          approvals: Object.fromEntries(client.approvals),
          log: client.log,
        });
      }
      const approvalMatch = path.match(/^\/mock\/approvals\/([A-Za-z0-9_]+)$/);
      if (req.method === "POST" && approvalMatch) {
        const { approved } = (await readJson(req)) as { approved?: boolean };
        client.resolve(approvalMatch[1]!, Boolean(approved));
        return send(res, 200, { ok: true });
      }
    }

    return send(res, 404, { error: "not found" });
  } catch (err) {
    return send(res, 400, { error: (err as Error).message });
  }
});

server.listen(config.port, () => {
  console.log(`[agent] listening on http://localhost:${config.port} (mock API: ${config.mockApi})`);
});
