import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Rules } from "@mandate/shared";
import { buildServer } from "../src/server.js";
import { prisma } from "../src/db.js";

const testRules: Rules = {
  currency: "USD",
  monthlyCap: 500,
  perTxCap: 150,
  approvalAbove: 75,
  allowedCategories: ["groceries", "household"],
  allowedMerchants: ["demo-store"],
  blockedKeywords: ["gift card"],
  expiresAt: "2026-12-31T23:59:59Z",
};

describe("Mandate and Receipt Routes", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
    await prisma.receipt.deleteMany({
      where: { mandateId: { in: ["mdt_route_test_1", "mdt_route_test_2"] } },
    });
    await prisma.mandate.deleteMany({
      where: { id: { in: ["mdt_route_test_1", "mdt_route_test_2"] } },
    });
  });

  afterAll(async () => {
    await prisma.receipt.deleteMany({
      where: { mandateId: { in: ["mdt_route_test_1", "mdt_route_test_2"] } },
    });
    await prisma.mandate.deleteMany({
      where: { id: { in: ["mdt_route_test_1", "mdt_route_test_2"] } },
    });
    await server.close();
    await prisma.$disconnect();
  });

  it("POST /mandates creates a signed active mandate and writes mandate_created receipt", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/mandates",
      payload: {
        userId: "anita_test",
        rules: testRules,
        id: "mdt_route_test_1",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.mandate).toBeDefined();
    expect(body.mandate.id).toBe("mdt_route_test_1");
    expect(body.mandate.userId).toBe("anita_test");
    expect(body.mandate.status).toBe("active");
    expect(body.mandate.signature).toBeDefined();
    expect(body.mandate.publicKey).toBeDefined();
    expect(typeof body.approveUrl).toBe("string");

    // Verify receipt was written
    const receiptRes = await server.inject({
      method: "GET",
      url: "/receipts?mandateId=mdt_route_test_1",
    });
    expect(receiptRes.statusCode).toBe(200);
    const receipts = receiptRes.json();
    expect(receipts).toHaveLength(1);
    expect(receipts[0].type).toBe("mandate_created");
    expect(receipts[0].seq).toBe(1);
  });

  it("POST /mandates revokes previous active mandate for the same user", async () => {
    const res2 = await server.inject({
      method: "POST",
      url: "/mandates",
      payload: {
        userId: "anita_test",
        rules: { ...testRules, monthlyCap: 600 },
        id: "mdt_route_test_2",
      },
    });

    expect(res2.statusCode).toBe(201);

    // Verify previous mandate is now revoked
    const prev = await prisma.mandate.findUnique({
      where: { id: "mdt_route_test_1" },
    });
    expect(prev?.status).toBe("revoked");

    const current = await prisma.mandate.findUnique({
      where: { id: "mdt_route_test_2" },
    });
    expect(current?.status).toBe("active");
  });

  it("GET /mandates/:id returns 404 for unknown mandate", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/mandates/non_existent_id",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toHaveProperty("error");
  });

  it("GET /mandates/:id returns mandate with spentThisMonth in dollars", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/mandates/mdt_route_test_2",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe("mdt_route_test_2");
    expect(body.spentThisMonth).toBe(0);
    expect(body.rules.monthlyCap).toBe(600);
  });

  it("GET /receipts/verify validates chain integrity", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/receipts/verify?mandateId=mdt_route_test_2",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.checked).toBe(1);
  });

  it("GET /receipts/verify returns 404 for unknown mandate", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/receipts/verify?mandateId=non_existent_id",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toHaveProperty("error");
  });
});
