import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import type { LiveEventV2, Rules } from "@mandate/shared";
import { buildServer } from "../src/server.js";
import { prisma } from "../src/db.js";
import { signMandate, getPublicKeyPem } from "../src/crypto/signing.js";
import { canonicalJson } from "../src/crypto/canonical.js";
import { appendReceipt, verifyChain } from "../src/receipts.js";
import { subscribe } from "../src/events.js";
import { MockPayPal } from "../src/paypal/mock.js";
import { SandboxPayPal } from "../src/paypal/sandbox.js";
import { outcomeToStatus } from "../src/disputes.js";
import type { DetectorClient } from "../src/detector.js";

const rules: Rules = {
  currency: "USD",
  monthlyCap: 300,
  perTxCap: 100,
  approvalAbove: 60,
  allowedCategories: ["groceries", "school"],
  allowedMerchants: ["demo-store"],
  blockedKeywords: ["gift card", "crypto", "bitcoin"],
  expiresAt: "2026-12-31T23:59:59Z",
};
const mandateId = "mdt_dispute_test";
const detector: DetectorClient = async () => ({ ok: true, report: { riskScore: 0.05, signals: [], verdict: "safe" } });

describe("Webhooks and dispute defender", () => {
  let server: FastifyInstance;
  let paypal: MockPayPal;
  const events: LiveEventV2[] = [];
  let unsubscribe: () => void;
  let captureId: string;
  let cartId: string;

  const webhook = (event: object, mock = true) =>
    server.inject({
      method: "POST",
      url: "/webhooks/paypal",
      headers: { "content-type": "application/json", ...(mock ? { "x-mock-webhook": "1" } : {}) },
      payload: JSON.stringify(event),
    });

  const disputeCreated = (disputeId: string, sellerTxn: string) => ({
    id: `WH-${randomUUID()}`,
    event_type: "CUSTOMER.DISPUTE.CREATED",
    resource: {
      dispute_id: disputeId,
      reason: "UNAUTHORISED",
      status: "WAITING_FOR_SELLER_RESPONSE",
      dispute_amount: { currency_code: "USD", value: "10.47" },
      disputed_transactions: [{ seller_transaction_id: sellerTxn }],
    },
  });

  beforeAll(async () => {
    unsubscribe = subscribe((e) => events.push(e));
    paypal = new MockPayPal();
    server = await buildServer({ detector, paypalClient: paypal });
  });
  afterAll(async () => {
    unsubscribe();
    await server.close();
  });

  beforeEach(async () => {
    paypal.reset();
    events.length = 0;
    await prisma.dispute.deleteMany({ where: { payment: { mandateId } } });
    await prisma.dispute.deleteMany({ where: { disputeId: { startsWith: "PP-D-TEST" } } });
    await prisma.webhookEvent.deleteMany({});
    await prisma.receipt.deleteMany({ where: { mandateId } });
    await prisma.payment.deleteMany({ where: { mandateId } });
    await prisma.approval.deleteMany({ where: { cart: { mandateId } } });
    await prisma.cart.deleteMany({ where: { mandateId } });
    await prisma.mandate.deleteMany({ where: { id: mandateId } });

    const createdAt = "2026-01-01T00:00:00.000Z";
    await prisma.mandate.create({
      data: {
        id: mandateId,
        userId: "anita_dispute_test",
        rulesJson: canonicalJson(rules),
        signature: signMandate(rules, mandateId, createdAt),
        publicKey: getPublicKeyPem(),
        status: "active",
        createdAt: new Date(createdAt),
      },
    });
    await appendReceipt(mandateId, "mandate_created", { mandateId });

    cartId = `cart_d_${randomUUID().slice(0, 8)}`;
    captureId = `CAP-${randomUUID().slice(0, 8).toUpperCase()}`;
    const items = [
      { sku: "SCH-NOTEBOOK", name: "Spiral notebook, college ruled", category: "school", unitPrice: 2.49, qty: 2, merchant: "demo-store" },
      { sku: "GRO-MILK", name: "Organic whole milk, 1 gallon", category: "groceries", unitPrice: 5.49, qty: 1, merchant: "demo-store" },
    ];
    await prisma.cart.create({
      data: {
        id: cartId,
        mandateId,
        requestJson: JSON.stringify({ userRequest: "Buy notebooks and milk for this week", cart: { items, total: 10.47 } }),
        decision: "allow",
        reasonsJson: JSON.stringify(["within your rules"]),
        riskScore: 0.05,
        totalCents: 1047,
      },
    });
    await appendReceipt(mandateId, "check", { cartId, decision: "allow" });
    const payment = await prisma.payment.create({
      data: { id: `pay_d_${randomUUID().slice(0, 8)}`, cartId, mandateId, amountCents: 1047, paypalOrderId: "ORDER-D-1", captureId, status: "captured" },
    });
    await appendReceipt(mandateId, "payment", { cartId, paymentId: payment.id, captureId, status: "captured" });
  });

  it("rejects webhooks that fail signature verification", async () => {
    const res = await webhook(disputeCreated("PP-D-TEST-0", captureId), false);
    expect(res.statusCode).toBe(400);
    expect(await prisma.dispute.count({ where: { disputeId: "PP-D-TEST-0" } })).toBe(0);
  });

  it("CUSTOMER.DISPUTE.CREATED links the payment and auto-submits evidence with a PDF", async () => {
    const res = await webhook(disputeCreated("PP-D-TEST-1", captureId));
    expect(res.statusCode).toBe(200);

    const row = await prisma.dispute.findUnique({ where: { disputeId: "PP-D-TEST-1" } });
    expect(row?.status).toBe("evidence_submitted");
    expect(row?.paymentId).toBeTruthy();
    expect(paypal.callCounts.provideEvidence).toBe(1);

    const sent = paypal.evidences.get("PP-D-TEST-1");
    expect(sent?.evidenceType).toBe("OTHER");
    expect(sent?.fileBuffer?.subarray(0, 4).toString()).toBe("%PDF");
    expect(sent?.notes).toMatch(/spending mandate/);

    const receipts = await prisma.receipt.findMany({ where: { mandateId }, orderBy: { seq: "asc" } });
    expect(receipts.map((r) => r.type)).toEqual(expect.arrayContaining(["dispute", "dispute_evidence"]));
    expect((await verifyChain(mandateId)).ok).toBe(true);
    expect(events.filter((e) => e.type === "dispute").length).toBeGreaterThanOrEqual(2);
  });

  it("ignores duplicate webhook deliveries", async () => {
    const event = disputeCreated("PP-D-TEST-2", captureId);
    await webhook(event);
    const again = await webhook(event);
    expect(again.json()).toMatchObject({ ok: true, duplicate: true });
    expect(paypal.callCounts.provideEvidence).toBe(1);
  });

  it("GET /disputes returns the evidence the dashboard drawer needs", async () => {
    await webhook(disputeCreated("PP-D-TEST-3", captureId));
    const res = await server.inject({ method: "GET", url: "/disputes" });
    expect(res.statusCode).toBe(200);
    const d = res.json().find((x: { paypalDisputeId: string }) => x.paypalDisputeId === "PP-D-TEST-3");
    expect(d.status).toBe("evidence_submitted");
    expect(d.cartId).toBe(cartId);
    expect(d.amount).toBe(10.47);
    expect(d.evidence.mandate.signatureValid).toBe(true);
    expect(d.evidence.cart.userRequest).toBe("Buy notebooks and milk for this week");
    expect(d.evidence.chain.ok).toBe(true);
    expect(d.evidence.receipts.map((r: { type: string }) => r.type)).toEqual(expect.arrayContaining(["mandate_created", "check", "payment"]));

    const pdf = await server.inject({ method: "GET", url: `/disputes/${d.id}/evidence.pdf` });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
  });

  it("sandbox-resolve asks PayPal to rule and records the win once", async () => {
    await webhook(disputeCreated("PP-D-TEST-4", captureId));
    const row = await prisma.dispute.findUnique({ where: { disputeId: "PP-D-TEST-4" } });
    const res = await server.inject({ method: "POST", url: `/disputes/${row!.id}/sandbox-resolve`, payload: { outcome: "won" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("won");
    expect(paypal.callCounts.adjudicate).toBe(1);

    const again = await server.inject({ method: "POST", url: `/disputes/${row!.id}/defend` });
    expect(again.statusCode).toBe(409);
    expect((await verifyChain(mandateId)).ok).toBe(true);
  });

  it("a dispute for an unknown transaction is recorded but cannot be defended", async () => {
    await webhook(disputeCreated("PP-D-TEST-5", "CAP-UNKNOWN"));
    const row = await prisma.dispute.findUnique({ where: { disputeId: "PP-D-TEST-5" } });
    expect(row?.status).toBe("open");
    expect(row?.lastError).toMatch(/no captured payment/);
    const res = await server.inject({ method: "POST", url: `/disputes/${row!.id}/defend` });
    expect(res.statusCode).toBe(422);
    expect(paypal.callCounts.provideEvidence).toBe(0);
  });

  it("PayPal failure leaves the dispute retryable", async () => {
    paypal.failures.provideEvidence = new Error("sandbox down");
    await webhook(disputeCreated("PP-D-TEST-6", captureId));
    const row = await prisma.dispute.findUnique({ where: { disputeId: "PP-D-TEST-6" } });
    expect(row?.status).toBe("open");
    expect(row?.lastError).toMatch(/sandbox down/);

    paypal.failures = {};
    const retry = await server.inject({ method: "POST", url: `/disputes/${row!.id}/defend` });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().status).toBe("evidence_submitted");
  });

  it("CUSTOMER.DISPUTE.RESOLVED in the buyer's favour marks it lost", async () => {
    await webhook(disputeCreated("PP-D-TEST-7", captureId));
    await webhook({
      id: `WH-${randomUUID()}`,
      event_type: "CUSTOMER.DISPUTE.RESOLVED",
      resource: { dispute_id: "PP-D-TEST-7", status: "RESOLVED", dispute_outcome: { outcome_code: "RESOLVED_BUYER_FAVOUR" } },
    });
    expect((await prisma.dispute.findUnique({ where: { disputeId: "PP-D-TEST-7" } }))?.status).toBe("lost");
  });

  it("PAYMENT.CAPTURE.DENIED marks the payment failed", async () => {
    const res = await webhook({ id: `WH-${randomUUID()}`, event_type: "PAYMENT.CAPTURE.DENIED", resource: { id: captureId } });
    expect(res.statusCode).toBe(200);
    expect((await prisma.payment.findFirst({ where: { captureId } }))?.status).toBe("failed");
  });

  it("maps PayPal outcome codes (both spellings)", () => {
    expect(outcomeToStatus("RESOLVED_SELLER_FAVOUR")).toBe("won");
    expect(outcomeToStatus("RESOLVED_SELLER_FAVOR")).toBe("won");
    expect(outcomeToStatus("RESOLVED_BUYER_FAVOUR")).toBe("lost");
    expect(outcomeToStatus("RESOLVED_WITH_PAYOUT")).toBeNull();
  });
});

describe("SandboxPayPal dispute calls", () => {
  const token = () => new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });

  it("provide-evidence is sent as multipart/form-data with an input part and the PDF", async () => {
    let seen: { headers: Record<string, string>; body: unknown } | null = null;
    const fakeFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (url.toString().includes("/v1/oauth2/token")) return token();
      seen = { headers: init?.headers as Record<string, string>, body: init?.body };
      return new Response(JSON.stringify({ links: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = new SandboxPayPal(fakeFetch);
    await client.provideEvidence("PP-D-1", { notes: "authorised", evidenceType: "OTHER", fileBuffer: Buffer.from("%PDF-1.3"), fileName: "e.pdf" }, "req-1");

    const ct = seen!.headers["Content-Type"];
    expect(ct).toMatch(/^multipart\/form-data; boundary=/);
    const raw = Buffer.from(seen!.body as Uint8Array).toString("utf8");
    // input part: JSON content type, no filename (matches curl -F 'input=...;type=application/json')
    expect(raw).toContain('Content-Disposition: form-data; name="input"\r\nContent-Type: application/json\r\n\r\n{"evidences":[{"evidence_type":"OTHER","notes":"authorised"}]}');
    expect(raw).toContain('Content-Disposition: form-data; name="evidence-file"; filename="e.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.3');
    const boundary = ct.split("boundary=")[1];
    expect(raw.trimEnd().endsWith(`--${boundary}--`)).toBe(true);
    expect(seen!.headers["PayPal-Request-Id"]).toBe("req-1");
  });

  it("adjudicate and require-evidence send the documented bodies", async () => {
    const bodies: Record<string, unknown> = {};
    const fakeFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = url.toString();
      if (u.includes("/v1/oauth2/token")) return token();
      bodies[u.split("/").pop()!] = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ links: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = new SandboxPayPal(fakeFetch);
    await client.requireEvidence("PP-D-2", "r1");
    await client.adjudicate("PP-D-2", "SELLER_FAVOR", "r2");
    expect(bodies["require-evidence"]).toEqual({ action: "SELLER_EVIDENCE" });
    expect(bodies["adjudicate"]).toEqual({ adjudication_outcome: "SELLER_FAVOR" });
  });
});
