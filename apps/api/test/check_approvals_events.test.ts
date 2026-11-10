import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Cart, LiveEventV2, Rules } from "@mandate/shared";
import { buildServer } from "../src/server.js";
import { prisma } from "../src/db.js";
import { signMandate, getPublicKeyPem } from "../src/crypto/signing.js";
import { canonicalJson } from "../src/crypto/canonical.js";
import { subscribe } from "../src/events.js";
import type { DetectorClient } from "../src/detector.js";

const demoRules: Rules = {
  currency: "USD",
  monthlyCap: 300,
  perTxCap: 100,
  approvalAbove: 60,
  allowedCategories: ["groceries", "school"],
  allowedMerchants: ["demo-store"],
  blockedKeywords: ["gift card", "crypto", "bitcoin"],
  expiresAt: "2026-12-31T23:59:59Z",
};

describe("Check, Approvals, and Events routes", () => {
  let server: FastifyInstance;
  const eventsReceived: LiveEventV2[] = [];
  let unsubscribeEvents: () => void;

  const fakeDetector: DetectorClient = async (req) => {
    // If user request has "poison" or "injection", simulate high risk
    if (
      req.userRequest.includes("poison") ||
      req.pageText.includes("poison") ||
      req.pageText.includes("malicious")
    ) {
      return {
        ok: true,
        report: {
          riskScore: 0.95,
          signals: ["prompt injection detected"],
          verdict: "malicious",
        },
      };
    }
    return {
      ok: true,
      report: {
        riskScore: 0.1,
        signals: [],
        verdict: "safe",
      },
    };
  };

  beforeAll(async () => {
    unsubscribeEvents = subscribe((e) => {
      eventsReceived.push(e);
    });

    server = await buildServer({ detector: fakeDetector });

    // Seed clean mandate mdt_phase3_test
    await prisma.receipt.deleteMany({ where: { mandateId: "mdt_phase3_test" } });
    await prisma.approval.deleteMany({
      where: { cart: { mandateId: "mdt_phase3_test" } },
    });
    await prisma.cart.deleteMany({ where: { mandateId: "mdt_phase3_test" } });
    await prisma.mandate.deleteMany({ where: { id: "mdt_phase3_test" } });

    const createdAt = "2026-01-01T00:00:00.000Z";
    const signature = signMandate(demoRules, "mdt_phase3_test", createdAt);
    const publicKey = getPublicKeyPem();

    await prisma.mandate.create({
      data: {
        id: "mdt_phase3_test",
        userId: "anita",
        rulesJson: canonicalJson(demoRules),
        signature,
        publicKey,
        vaultId: null,
        status: "active",
        spentThisMonth: 0,
        createdAt: new Date(createdAt),
      },
    });
  });

  afterAll(async () => {
    unsubscribeEvents();
    await prisma.receipt.deleteMany({ where: { mandateId: "mdt_phase3_test" } });
    await prisma.approval.deleteMany({
      where: { cart: { mandateId: "mdt_phase3_test" } },
    });
    await prisma.cart.deleteMany({ where: { mandateId: "mdt_phase3_test" } });
    await prisma.mandate.deleteMany({ where: { id: "mdt_phase3_test" } });
    await server.close();
    await prisma.$disconnect();
  });

  it("POST /check allows normal $25 groceries cart and emits check event", async () => {
    const cart: Cart = {
      items: [
        {
          sku: "apples",
          name: "Organic Apples",
          category: "groceries",
          unitPrice: 25.0,
          qty: 1,
          merchant: "demo-store",
        },
      ],
      total: 25.0,
      agentReasoning: "Fresh produce",
      sourceUrls: [],
    };

    const res = await server.inject({
      method: "POST",
      url: "/check",
      payload: {
        mandateId: "mdt_phase3_test",
        cart,
        pageText: "Store page",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.decision).toBe("allow");
    expect(body.reasons).toEqual(["within your rules"]);
    expect(body.approvalId).toBeUndefined();
    expect(body.receiptSeq).toBeGreaterThanOrEqual(1);

    // Verify DB cart
    const dbCart = await prisma.cart.findUnique({
      where: { id: body.cartId },
    });
    expect(dbCart).toBeDefined();
    expect(dbCart?.decision).toBe("allow");

    // Verify SSE event was published
    const event = eventsReceived.find((e) => e.cartId === body.cartId);
    expect(event).toBeDefined();
    expect(event?.type).toBe("check");
    expect(event?.decision).toBe("allow");
  });

  it("POST /check holds $75 groceries for approval and event has ALL required fields", async () => {
    eventsReceived.length = 0; // clear
    const cart: Cart = {
      items: [
        {
          sku: "groceries-bulk",
          name: "Bulk Groceries",
          category: "groceries",
          unitPrice: 75.0,
          qty: 1,
          merchant: "demo-store",
        },
      ],
      total: 75.0,
      agentReasoning: "Stocking up",
      sourceUrls: [],
    };

    const res = await server.inject({
      method: "POST",
      url: "/check",
      payload: {
        mandateId: "mdt_phase3_test",
        cart,
        pageText: "Store page",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.decision).toBe("needs_approval");
    expect(body.approvalId).toBeDefined();
    expect(body.approvalId).toMatch(/^apr_/);

    // Verify approval in DB
    const approval = await prisma.approval.findUnique({
      where: { id: body.approvalId },
    });
    expect(approval).toBeDefined();
    expect(approval?.status).toBe("pending");

    // Verify SSE event contains ALL required fields:
    // approvalId, items, total, reasons, riskScore, cartId, decision
    const checkEvent = eventsReceived.find((e) => e.cartId === body.cartId);
    expect(checkEvent).toBeDefined();
    expect(checkEvent!.approvalId).toBe(body.approvalId);
    expect(checkEvent!.items).toHaveLength(1);
    expect(checkEvent!.total).toBe(75.0);
    expect(checkEvent!.reasons).toBeDefined();
    expect(checkEvent!.riskScore).toBeDefined();
    expect(checkEvent!.cartId).toBe(body.cartId);
    expect(checkEvent!.decision).toBe("needs_approval");
  });

  it("GET /approvals/:id and POST /approvals/:id resolve held carts", async () => {
    // Find the pending approval from previous test
    const pending = await prisma.approval.findFirst({
      where: { status: "pending", cart: { mandateId: "mdt_phase3_test" } },
    });
    expect(pending).toBeDefined();

    // 1. GET /approvals/:id -> { status: "pending" }
    const getRes = await server.inject({
      method: "GET",
      url: `/approvals/${pending!.id}`,
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json()).toEqual({ status: "pending" });

    // 2. POST /approvals/:id -> approve
    const postRes = await server.inject({
      method: "POST",
      url: `/approvals/${pending!.id}`,
      payload: { approved: true },
    });
    expect(postRes.statusCode).toBe(200);
    expect(postRes.json().status).toBe("approved");

    // 3. GET /approvals/:id -> { status: "approved" }
    const getResAfter = await server.inject({
      method: "GET",
      url: `/approvals/${pending!.id}`,
    });
    expect(getResAfter.statusCode).toBe(200);
    expect(getResAfter.json()).toEqual({ status: "approved" });

    // 4. Second POST returns 409 conflict
    const conflictRes = await server.inject({
      method: "POST",
      url: `/approvals/${pending!.id}`,
      payload: { approved: false },
    });
    expect(conflictRes.statusCode).toBe(409);
    expect(conflictRes.json()).toHaveProperty("error");
  });

  it("POST /check fails closed when detector is unavailable", async () => {
    // Server with failing detector
    const failingDetector: DetectorClient = async () => ({
      ok: false,
      error: "Detector unreachable",
    });

    const testServer = await buildServer({ detector: failingDetector });

    const cart: Cart = {
      items: [
        {
          sku: "apples",
          name: "Apples",
          category: "groceries",
          unitPrice: 10.0,
          qty: 1,
          merchant: "demo-store",
        },
      ],
      total: 10.0,
      agentReasoning: "Apples",
      sourceUrls: [],
    };

    const res = await testServer.inject({
      method: "POST",
      url: "/check",
      payload: {
        mandateId: "mdt_phase3_test",
        cart,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.decision).toBe("needs_approval");
    expect(body.reasons).toContain("risk check unavailable");
    expect(body.riskScore).toBe(1.0);

    await testServer.close();
  });

  it("POST /check returns 404 for unknown mandate", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/check",
      payload: {
        mandateId: "non_existent_mandate",
        cart: {
          items: [
            {
              sku: "item",
              name: "Item",
              category: "groceries",
              unitPrice: 5,
              qty: 1,
              merchant: "demo-store",
            },
          ],
          total: 5,
          agentReasoning: "test",
          sourceUrls: [],
        },
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toHaveProperty("error");
  });
});
