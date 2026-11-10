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
 * Mock mode only (MOCK_API=1):
 *   GET  /mock/state             carts, approvals, spend
 *   POST /mock/approvals/:id     { approved: boolean }
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { DetectRequest } from "@mandate/shared";
import { runAgent } from "./agent.js";
import { config } from "./config.js";
import { detect } from "./detector.js";
import { defaultClient, MockMandateClient } from "./mandateClient.js";
import { allProducts, getProduct, pageText } from "./store.js";

const client = defaultClient();

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
