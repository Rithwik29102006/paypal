import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Cart, Rules } from "@mandate/shared";
import { buildServer } from "../src/server.js";
import { prisma } from "../src/db.js";
import { signMandate, getPublicKeyPem } from "../src/crypto/signing.js";
import { canonicalJson } from "../src/crypto/canonical.js";
import type { DetectorClient } from "../src/detector.js";

const ID = "mdt_pause_test";
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
  await prisma.approval.deleteMany({ where: { cart: { mandateId: ID } } });
  await prisma.cart.deleteMany({ where: { mandateId: ID } });
  await prisma.mandate.deleteMany({ where: { id: ID } });
}

describe("emergency stop: pause and resume a mandate", () => {
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
    await clean();
    await server.close();
    await prisma.$disconnect();
  });

  const check = () => server.inject({ method: "POST", url: "/check", payload: { mandateId: ID, cart, pageText: "Milk" } });

  it("blocks every cart while paused and allows again after resume", async () => {
    expect((await check()).json().decision).toBe("allow");

    const paused = await server.inject({ method: "POST", url: `/mandates/${ID}/pause` });
    expect(paused.statusCode).toBe(200);
    expect(paused.json().status).toBe("paused");

    const blocked = (await check()).json();
    expect(blocked.decision).toBe("block");
    expect(blocked.reasons.join(" ")).toMatch(/paused/);

    const resumed = await server.inject({ method: "POST", url: `/mandates/${ID}/resume` });
    expect(resumed.json().status).toBe("active");
    expect((await check()).json().decision).toBe("allow");
  });

  it("records each switch in the receipt log", async () => {
    const rows = await prisma.receipt.findMany({ where: { mandateId: ID, type: "mandate_updated" } });
    expect(rows.map((r) => JSON.parse(r.payload).status)).toEqual(["paused", "active"]);
  });

  it("404s for an unknown mandate", async () => {
    const res = await server.inject({ method: "POST", url: "/mandates/nope/pause" });
    expect(res.statusCode).toBe(404);
  });
});
