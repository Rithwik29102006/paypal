import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import type { Cart, LiveEventV2, Rules } from "@mandate/shared";
import { buildServer } from "../src/server.js";
import { prisma } from "../src/db.js";
import { signMandate, getPublicKeyPem, verifyMandate } from "../src/crypto/signing.js";
import { canonicalJson } from "../src/crypto/canonical.js";
import { subscribe } from "../src/events.js";
import { MockPayPal } from "../src/paypal/mock.js";
import { getSpentThisMonthCents } from "../src/spend.js";
import type { DetectorClient } from "../src/detector.js";

const testRules: Rules = {
  currency: "USD",
  monthlyCap: 300,
  perTxCap: 100,
  approvalAbove: 60,
  allowedCategories: ["groceries", "school"],
  allowedMerchants: ["demo-store"],
  blockedKeywords: ["gift card", "crypto", "bitcoin"],
  expiresAt: "2026-12-31T23:59:59Z",
};

describe("POST /pay and PayPal integration", () => {
  let server: FastifyInstance;
  let mockPayPal: MockPayPal;
  const eventsReceived: LiveEventV2[] = [];
  let unsubscribeEvents: () => void;

  const fakeDetector: DetectorClient = async () => ({
    ok: true,
    report: {
      riskScore: 0.1,
      signals: [],
      verdict: "safe",
    },
  });

  const mandateId = "mdt_pay_test";

  beforeAll(async () => {
    unsubscribeEvents = subscribe((e) => {
      eventsReceived.push(e);
    });

    mockPayPal = new MockPayPal();
    server = await buildServer({
      detector: fakeDetector,
      paypalClient: mockPayPal,
    });
  });

  afterAll(async () => {
    unsubscribeEvents();
    await server.close();
  });

  beforeEach(async () => {
    mockPayPal.reset();
    eventsReceived.length = 0;

    // Clean up test data for mdt_pay_test
    await prisma.receipt.deleteMany({ where: { mandateId } });
    await prisma.payment.deleteMany({ where: { mandateId } });
    await prisma.approval.deleteMany({
      where: { cart: { mandateId } },
    });
    await prisma.cart.deleteMany({ where: { mandateId } });
    await prisma.mandate.deleteMany({ where: { id: mandateId } });

    const createdAt = "2026-01-01T00:00:00.000Z";
    const signature = signMandate(testRules, mandateId, createdAt);
    const publicKey = getPublicKeyPem();

    await prisma.mandate.create({
      data: {
        id: mandateId,
        userId: "anita_test",
        rulesJson: canonicalJson(testRules),
        signature,
        publicKey,
        setupTokenId: "MOCK-SETUP-INIT",
        vaultId: null,
        status: "active",
        spentThisMonth: 0,
        createdAt: new Date(createdAt),
      },
    });
  });

  async function createCart(params: {
    cartId: string;
    total: number;
    decision: "allow" | "needs_approval" | "block";
    reasons?: string[];
  }) {
    const cartReq = {
      userRequest: "buy items",
      cart: {
        items: [
          {
            name: "Apples",
            category: "groceries",
            merchant: "demo-store",
            unitPrice: params.total,
            qty: 1,
          },
        ],
        total: params.total,
      },
      pageText: "Demo store checkout",
    };

    return await prisma.cart.create({
      data: {
        id: params.cartId,
        mandateId,
        requestJson: JSON.stringify(cartReq),
        decision: params.decision,
        reasonsJson: JSON.stringify(params.reasons ?? []),
        riskScore: 0.1,
        totalCents: Math.round(params.total * 100),
      },
    });
  }

  it("allow cart -> captured, receipt written, SSE event emitted, MockPayPal.createOrder called exactly once", async () => {
    const cartId = `cart_allow_${randomUUID().slice(0, 8)}`;
    await createCart({ cartId, total: 10, decision: "allow" });

    const res = await server.inject({
      method: "POST",
      url: "/pay",
      payload: { cartId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("captured");
    expect(body.paymentId).toMatch(/^pay_/);
    expect(body.paypalOrderId).toMatch(/^MOCK-ORDER-/);
    expect(body.captureId).toMatch(/^MOCK-CAP-/);
    expect(typeof body.receiptSeq).toBe("number");

    // MockPayPal called exactly once
    expect(mockPayPal.callCounts.createOrder).toBe(1);
    expect(mockPayPal.callCounts.captureOrder).toBe(1);

    // Receipt written
    const receipt = await prisma.receipt.findFirst({
      where: { mandateId, type: "payment" },
    });
    expect(receipt).not.toBeNull();
    const payload = JSON.parse(receipt!.payload);
    expect(payload.cartId).toBe(cartId);
    expect(payload.amountCents).toBe(1000);
    expect(payload.status).toBe("captured");

    // SSE event emitted
    const paymentEvent = eventsReceived.find(
      (e) => e.type === "payment" && e.cartId === cartId
    );
    expect(paymentEvent).toBeDefined();
    expect(paymentEvent?.total).toBe(10);
  });

  it("blocked cart -> 403, MockPayPal not called", async () => {
    const cartId = `cart_block_${randomUUID().slice(0, 8)}`;
    await createCart({
      cartId,
      total: 10,
      decision: "block",
      reasons: ["merchant dem0-store is blocked"],
    });

    const res = await server.inject({
      method: "POST",
      url: "/pay",
      payload: { cartId },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error).toBe("payment not permitted");
    expect(mockPayPal.callCounts.createOrder).toBe(0);
  });

  it("needs_approval + pending approval -> 403", async () => {
    const cartId = `cart_pending_${randomUUID().slice(0, 8)}`;
    await createCart({ cartId, total: 75, decision: "needs_approval" });

    await prisma.approval.create({
      data: {
        id: `app_${randomUUID().slice(0, 8)}`,
        cartId,
        status: "pending",
      },
    });

    const res = await server.inject({
      method: "POST",
      url: "/pay",
      payload: { cartId },
    });

    expect(res.statusCode).toBe(403);
    expect(mockPayPal.callCounts.createOrder).toBe(0);
  });

  it("needs_approval + rejected approval -> 403", async () => {
    const cartId = `cart_rejected_${randomUUID().slice(0, 8)}`;
    await createCart({ cartId, total: 75, decision: "needs_approval" });

    await prisma.approval.create({
      data: {
        id: `app_${randomUUID().slice(0, 8)}`,
        cartId,
        status: "rejected",
        decidedAt: new Date(),
      },
    });

    const res = await server.inject({
      method: "POST",
      url: "/pay",
      payload: { cartId },
    });

    expect(res.statusCode).toBe(403);
    expect(mockPayPal.callCounts.createOrder).toBe(0);
  });

  it("needs_approval + approval for a DIFFERENT cart -> 403", async () => {
    const cartId1 = `cart_diff_1_${randomUUID().slice(0, 8)}`;
    const cartId2 = `cart_diff_2_${randomUUID().slice(0, 8)}`;

    await createCart({ cartId: cartId1, total: 75, decision: "needs_approval" });
    await createCart({ cartId: cartId2, total: 75, decision: "needs_approval" });

    // Approve cart 2, but attempt to pay cart 1
    await prisma.approval.create({
      data: {
        id: `app_${randomUUID().slice(0, 8)}`,
        cartId: cartId2,
        status: "approved",
        decidedAt: new Date(),
      },
    });

    const res = await server.inject({
      method: "POST",
      url: "/pay",
      payload: { cartId: cartId1 },
    });

    expect(res.statusCode).toBe(403);
    expect(mockPayPal.callCounts.createOrder).toBe(0);
  });

  it("pay twice (sequential) -> 200 both times, createOrder called ONCE", async () => {
    const cartId = `cart_seq_${randomUUID().slice(0, 8)}`;
    await createCart({ cartId, total: 15, decision: "allow" });

    const res1 = await server.inject({
      method: "POST",
      url: "/pay",
      payload: { cartId },
    });
    expect(res1.statusCode).toBe(200);
    const body1 = res1.json();
    expect(body1.status).toBe("captured");
    expect(mockPayPal.callCounts.createOrder).toBe(1);

    const res2 = await server.inject({
      method: "POST",
      url: "/pay",
      payload: { cartId },
    });
    expect(res2.statusCode).toBe(200);
    const body2 = res2.json();
    expect(body2.status).toBe("captured");
    expect(body2.paymentId).toBe(body1.paymentId);
    expect(body2.paypalOrderId).toBe(body1.paypalOrderId);

    // Still exactly 1 call to createOrder
    expect(mockPayPal.callCounts.createOrder).toBe(1);
  });

  it("pay twice (concurrent, 5 requests at once) -> all return 200, createOrder called ONCE, one payment row", async () => {
    const cartId = `cart_concurrent_${randomUUID().slice(0, 8)}`;
    await createCart({ cartId, total: 20, decision: "allow" });

    const responses = await Promise.all([
      server.inject({ method: "POST", url: "/pay", payload: { cartId } }),
      server.inject({ method: "POST", url: "/pay", payload: { cartId } }),
      server.inject({ method: "POST", url: "/pay", payload: { cartId } }),
      server.inject({ method: "POST", url: "/pay", payload: { cartId } }),
      server.inject({ method: "POST", url: "/pay", payload: { cartId } }),
    ]);

    for (const r of responses) {
      expect(r.statusCode).toBe(200);
      expect(r.json().status).toBe("captured");
    }

    // PayPal createOrder called exactly once
    expect(mockPayPal.callCounts.createOrder).toBe(1);

    // Exactly one Payment row in DB
    const paymentRows = await prisma.payment.findMany({
      where: { cartId },
    });
    expect(paymentRows.length).toBe(1);
  });

  it("mandate spentThisMonth + total > monthlyCap AT PAY TIME -> 403, createOrder not called", async () => {
    // Mandate monthlyCap is $300.
    // Simulate existing captured payment of $290 this month.
    const dummyCartId = `cart_spent_prior_${randomUUID().slice(0, 8)}`;
    await createCart({ cartId: dummyCartId, total: 290, decision: "allow" });
    await prisma.payment.create({
      data: {
        id: `pay_prior_${randomUUID().slice(0, 8)}`,
        cartId: dummyCartId,
        mandateId,
        amountCents: 29000,
        currency: "USD",
        paypalOrderId: "MOCK-ORDER-PRIOR",
        captureId: "MOCK-CAP-PRIOR",
        status: "captured",
        createdAt: new Date(),
      },
    });

    // New cart of $15 -> 290 + 15 = 305 > 300
    const cartId = `cart_over_cap_${randomUUID().slice(0, 8)}`;
    await createCart({ cartId, total: 15, decision: "allow" });

    const res = await server.inject({
      method: "POST",
      url: "/pay",
      payload: { cartId },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.reasons).toContain("cart total exceeds monthly cap");
    expect(mockPayPal.callCounts.createOrder).toBe(0);
  });

  it("mandate revoked or expired between /check and /pay -> 403", async () => {
    const cartId = `cart_revoked_${randomUUID().slice(0, 8)}`;
    await createCart({ cartId, total: 10, decision: "allow" });

    // Revoke mandate in DB
    await prisma.mandate.update({
      where: { id: mandateId },
      data: { status: "revoked" },
    });

    const res = await server.inject({
      method: "POST",
      url: "/pay",
      payload: { cartId },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.reasons).toContain("mandate is revoked");
    expect(mockPayPal.callCounts.createOrder).toBe(0);
  });

  it("spentThisMonth correctly includes captured payments in getSpentThisMonthCents", async () => {
    const initialSpend = await getSpentThisMonthCents(mandateId);

    const cartId = `cart_spend_calc_${randomUUID().slice(0, 8)}`;
    await createCart({ cartId, total: 25, decision: "allow" });

    const payRes = await server.inject({
      method: "POST",
      url: "/pay",
      payload: { cartId },
    });
    expect(payRes.statusCode).toBe(200);

    const newSpend = await getSpentThisMonthCents(mandateId);
    expect(newSpend).toBe(initialSpend + 2500);
  });

  it("POST /mandates/:id/vault/complete sets vaultId and is idempotent", async () => {
    // 1. Create a mandate via POST /mandates
    const createRes = await server.inject({
      method: "POST",
      url: "/mandates",
      payload: {
        userId: "anita_vault_test",
        rules: testRules,
        id: `mdt_vault_${randomUUID().slice(0, 8)}`,
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = createRes.json();
    const newMandateId = created.mandate.id;
    expect(created.approveUrl).toBeDefined();

    // 2. Complete vault
    const completeRes1 = await server.inject({
      method: "POST",
      url: `/mandates/${newMandateId}/vault/complete`,
    });

    expect(completeRes1.statusCode).toBe(200);
    const vaulted1 = completeRes1.json();
    expect(vaulted1.vaultId).toMatch(/^MOCK-VAULT-/);

    // Verify signature was updated to cover vaultId
    const mandateInDb = await prisma.mandate.findUnique({
      where: { id: newMandateId },
    });
    expect(mandateInDb?.vaultId).toBe(vaulted1.vaultId);
    const sigValid = verifyMandate({
      rules: JSON.parse(mandateInDb!.rulesJson),
      id: mandateInDb!.id,
      createdAt: mandateInDb!.createdAt.toISOString(),
      signature: mandateInDb!.signature,
      publicKey: mandateInDb!.publicKey,
      vaultId: mandateInDb!.vaultId,
    });
    expect(sigValid).toBe(true);

    // Check mandate_updated receipt
    const updateReceipt = await prisma.receipt.findFirst({
      where: { mandateId: newMandateId, type: "mandate_updated" },
    });
    expect(updateReceipt).not.toBeNull();

    // 3. Complete vault second time (idempotent)
    const completeRes2 = await server.inject({
      method: "POST",
      url: `/mandates/${newMandateId}/vault/complete`,
    });

    expect(completeRes2.statusCode).toBe(200);
    const vaulted2 = completeRes2.json();
    expect(vaulted2.vaultId).toBe(vaulted1.vaultId);
  });

  it("createSetupToken failure in POST /mandates returns 502 and leaves no DB rows", async () => {
    mockPayPal.failures.createSetupToken = new Error("Simulated PayPal outage");

    const failedMandateId = `mdt_fail_${randomUUID().slice(0, 8)}`;
    const res = await server.inject({
      method: "POST",
      url: "/mandates",
      payload: {
        userId: "user_setup_fail",
        rules: testRules,
        id: failedMandateId,
      },
    });

    expect(res.statusCode).toBe(502);
    expect(res.json().error).toContain("PayPal setup token error");

    // Ensure no mandate row exists in DB
    const dbRow = await prisma.mandate.findUnique({
      where: { id: failedMandateId },
    });
    expect(dbRow).toBeNull();
  });
});
