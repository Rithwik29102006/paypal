import type { FastifyInstance } from "fastify";
import { CreateMandateRequest } from "@mandate/shared";
import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { signMandate, getPublicKeyPem } from "../crypto/signing.js";
import { canonicalJson } from "../crypto/canonical.js";
import { appendReceipt } from "../receipts.js";

export async function mandateRoutes(server: FastifyInstance) {
  // POST /mandates
  server.post("/mandates", async (request, reply) => {
    const parseResult = CreateMandateRequest.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        reasons: parseResult.error.issues.map(
          (i) => `${i.path.join(".") || "body"}: ${i.message}`
        ),
      });
    }

    const { userId, rules, id: customId } = parseResult.data;
    const mandateId = customId || `mdt_${randomUUID().slice(0, 8)}`;
    const createdAt = new Date().toISOString();
    const signature = signMandate(rules, mandateId, createdAt);
    const publicKey = getPublicKeyPem();

    // Revoke previous active mandates for the same user
    await prisma.mandate.updateMany({
      where: { userId, status: "active" },
      data: { status: "revoked" },
    });

    const created = await prisma.mandate.create({
      data: {
        id: mandateId,
        userId,
        rulesJson: canonicalJson(rules),
        signature,
        publicKey,
        vaultId: null,
        status: "active",
        spentThisMonth: 0,
        createdAt: new Date(createdAt),
      },
    });

    // Write hash-chained receipt for mandate creation
    await appendReceipt(mandateId, "mandate_created", {
      mandateId,
      userId,
      rules,
      createdAt,
    });

    return reply.status(201).send({
      mandate: {
        id: created.id,
        userId: created.userId,
        rules: JSON.parse(created.rulesJson),
        signature: created.signature,
        publicKey: created.publicKey,
        vaultId: created.vaultId,
        status: created.status,
        createdAt: created.createdAt.toISOString(),
        spentThisMonth: 0,
      },
      approveUrl: null,
    });
  });

  // GET /mandates/:id
  server.get("/mandates/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const mandate = await prisma.mandate.findUnique({
      where: { id },
    });

    if (!mandate) {
      return reply.status(404).send({
        error: `Mandate "${id}" not found`,
      });
    }

    // Calculate spentThisMonth: sum of captured payments in current calendar month in dollars
    const now = new Date();
    const startOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );
    const capturedPayments = await prisma.payment.findMany({
      where: {
        mandateId: id,
        status: "captured",
        createdAt: { gte: startOfMonth },
      },
    });

    const sumCents = capturedPayments.reduce(
      (acc, p) => acc + p.amountCents,
      0
    );
    const spentThisMonth = Number((sumCents / 100).toFixed(2));

    return reply.send({
      id: mandate.id,
      userId: mandate.userId,
      rules: JSON.parse(mandate.rulesJson),
      signature: mandate.signature,
      publicKey: mandate.publicKey,
      vaultId: mandate.vaultId,
      status: mandate.status,
      createdAt: mandate.createdAt.toISOString(),
      spentThisMonth,
    });
  });
}
