/**
 * Contract tests: the real HttpMandateClient against a fake server that
 * answers with the response shapes Member 2's apps/api uses (routes/check.ts,
 * routes/pay.ts, routes/approvals.ts). Catches drift between agent and API
 * without needing Prisma or PayPal.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpMandateClient, MockMandateClient } from "../src/mandateClient.js";
import { AgentSession } from "../src/session.js";

type Handler = (body: any) => { status: number; json: unknown };
const routes = new Map<string, Handler>();
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const h = routes.get(`${req.method} ${req.url}`);
    const out = h ? h(body) : { status: 404, json: { error: "not found" } };
    res.writeHead(out.status, { "content-type": "application/json" });
    res.end(JSON.stringify(out.json));
  });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const allow = { status: 200, json: { cartId: "cart_1", decision: "allow", reasons: ["within your rules"], riskScore: 0.02, receiptSeq: 4 } };

describe("agent <-> Mandate API contract", () => {
  it("captured payment -> paid", async () => {
    routes.set("POST /check", () => allow);
    routes.set("POST /pay", () => ({ status: 200, json: { paymentId: "pay_1", paypalOrderId: "5O190127TN364715T", captureId: "3C679366HH908993F", status: "captured", receiptSeq: 5 } }));
    const s = new AgentSession("buy milk", new HttpMandateClient(baseUrl), "mdt_demo");
    const out = await s.requestPayment([{ sku: "GRO-MILK", qty: 1 }], "Milk.");
    expect(out.status).toBe("paid");
    expect(out.paypalOrderId).toBe("5O190127TN364715T");
  });

  it("order created without a saved payment method -> awaiting_buyer_approval, not paid", async () => {
    routes.set("POST /check", () => allow);
    routes.set("POST /pay", () => ({ status: 200, json: { paymentId: "pay_2", paypalOrderId: "ORD-2", captureId: null, status: "created", approveUrl: "https://www.sandbox.paypal.com/checkoutnow?token=ORD-2" } }));
    const s = new AgentSession("buy milk", new HttpMandateClient(baseUrl), "mdt_demo");
    const out = await s.requestPayment([{ sku: "GRO-MILK", qty: 1 }], "Milk.");
    expect(out.status).toBe("awaiting_buyer_approval");
    expect(out.approveUrl).toContain("sandbox.paypal.com");
    expect(s.events.some((e) => e.summary.startsWith("Paid"))).toBe(false);
    // The dashboard shows an "Approve in PayPal" button from this event.
    expect(s.events.find((e) => e.approveUrl)?.approveUrl).toContain("sandbox.paypal.com");
  });

  it("/pay 403 (second lock) -> error, nothing paid", async () => {
    routes.set("POST /check", () => allow);
    routes.set("POST /pay", () => ({ status: 403, json: { error: "cart is not payable", reasons: ["decision is block"] } }));
    const s = new AgentSession("buy milk", new HttpMandateClient(baseUrl), "mdt_demo");
    const out = await s.requestPayment([{ sku: "GRO-MILK", qty: 1 }], "Milk.");
    expect(out.status).toBe("error");
    expect(out.message).toContain("403");
  });

  it("needs_approval -> polls GET /approvals/:id -> pays after approval", async () => {
    let polls = 0;
    routes.set("POST /check", () => ({ status: 200, json: { cartId: "cart_3", decision: "needs_approval", reasons: ["total 62.43 is above your ask-me amount 60"], riskScore: 0.1, receiptSeq: 6, approvalId: "apr_3" } }));
    routes.set("GET /approvals/apr_3", () => ({ status: 200, json: { status: ++polls < 2 ? "pending" : "approved" } }));
    routes.set("POST /pay", () => ({ status: 200, json: { paymentId: "pay_3", paypalOrderId: "ORD-3", captureId: "CAP-3", status: "captured" } }));
    const s = new AgentSession("school supplies", new HttpMandateClient(baseUrl), "mdt_demo");
    const out = await s.requestPayment([{ sku: "SCH-BACKPACK", qty: 1 }, { sku: "SCH-CALC", qty: 1 }, { sku: "SCH-CRAYONS", qty: 5 }], "School items.");
    expect(out.status).toBe("paid");
    expect(polls).toBeGreaterThanOrEqual(2);
  }, 10_000);

  it("failed payment -> error", async () => {
    const client = new MockMandateClient("approve");
    client.pay = async () => ({ paymentId: "pay_4", paypalOrderId: "ORD-4", captureId: null, status: "failed" });
    const s = new AgentSession("buy milk", client, "mdt_demo");
    const out = await s.requestPayment([{ sku: "GRO-MILK", qty: 1 }], "Milk.");
    expect(out.status).toBe("error");
  });
});
