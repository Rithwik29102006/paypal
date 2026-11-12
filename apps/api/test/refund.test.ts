import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Cart, Rules } from "@mandate/shared";
import { buildServer } from "../src/server.js";
import { prisma } from "../src/db.js";
import { signMandate, getPublicKeyPem } from "../src/crypto/signing.js";
import { canonicalJson } from "../src/crypto/canonical.js";
import type { DetectorClient } from "../src/detector.js";

const ID = "mdt_refund_test";
const rules: Rules = {
  currency: "USD",
  monthlyCap: 300,
  perTxCap: 100,
  approvalAbove: 60,
  allowedCategories: ["groceries"],
  allowedMerchants: ["demo-store"],
  blockedKeywords: [],
  expiresAt: "2026-12-31T23:59:59Z",
};
const cart: Cart = {
  items: [{ sku: "GRO-MILK", name: "Milk", category: "groceries", unitPrice: 5, qty: 1, merchant: "demo-store" }],
  total: 5,
  agentReasoning: "weekly milk",
  sourceUrls: [],
};
const safeDetector: DetectorClient = async () => ({ ok: true, report: { riskScore: 0.05, signals: [], verdict: "safe" } });

async function clean() {
  await prisma.receipt.deleteMany({ where: { mandateId: ID } });
  await prisma.payment.deleteMany({ where: { mandateId: ID } });
  await prisma.approval.deleteMany({ where: { cart: { mandateId: ID } } });
  await prisma.cart.deleteMany({ where: { mandateId: ID } });
  await prisma.mandate.deleteMany({ where: { id: ID } });
}

describe("undo: refund a captured payment", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer({ detector: safeDetector });
    await clean();
    const createdAt = "2026-01-01T00:00:00.000Z";
    await prisma.mandate.create({
      data: {
        id: ID,
        userId: "anita",
        rulesJson: canonicalJson(rules),
        signature: signMandate(rules, ID, createdAt),
        publicKey: getPublicKeyPem(),
        vaultId: null,
        status: "active",
        spentThisMonth: 0,
        createdAt: new Date(createdAt),
      },
    });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { mandateId: ID } });
    await clean();
    await server.close();
    await prisma.$disconnect();
  });

  it("refunds through PayPal, records it, and stops counting it as spent", async () => {
    const check = (await server.inject({ method: "POST", url: "/check", payload: { mandateId: ID, cart, pageText: "Milk" } })).json();
    expect(check.decision).toBe("allow");
    let pay = (await server.inject({ method: "POST", url: "/pay", payload: { cartId: check.cartId } })).json();
    if (pay.status === "created") pay = (await server.inject({ method: "POST", url: "/pay", payload: { cartId: check.cartId } })).json();
    expect(pay.status).toBe("captured");

    const res = await server.inject({ method: "POST", url: `/carts/${check.cartId}/refund` });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("refunded");

    const again = await server.inject({ method: "POST", url: `/carts/${check.cartId}/refund` });
    expect(again.json().status).toBe("refunded");

    const m = (await server.inject({ method: "GET", url: `/mandates/${ID}` })).json();
    expect(m.spentThisMonth).toBe(0);
    const receipts = await prisma.receipt.findMany({ where: { mandateId: ID, type: "payment" } });
    expect(receipts.some((r) => JSON.parse(r.payload).status === "refunded")).toBe(true);
  });

  it("404s when there is no payment for the cart", async () => {
    const res = await server.inject({ method: "POST", url: "/carts/cart_nope/refund" });
    expect(res.statusCode).toBe(404);
  });
});
