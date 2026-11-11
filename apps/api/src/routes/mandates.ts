import type { FastifyInstance } from "fastify";
import { CreateMandateRequest } from "@mandate/shared";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { signMandate, getPublicKeyPem } from "../crypto/signing.js";
import { canonicalJson } from "../crypto/canonical.js";
import { appendReceipt } from "../receipts.js";
import { publish } from "../events.js";
import { getSpentThisMonthCents } from "../spend.js";
import { getPayPalClient, type PayPalClient } from "../paypal/client.js";

export async function mandateRoutes(
  server: FastifyInstance,
  paypalClient: PayPalClient = getPayPalClient()
) {
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
    const returnUrl = `${config.PAYPAL_RETURN_URL}?mandateId=${mandateId}`;
    const cancelUrl = config.PAYPAL_CANCEL_URL;
    const requestId = randomUUID();

    // 1. Create setup token FIRST with PayPal
    let setupTokenResult: { setupTokenId: string; approveUrl: string };
    try {
      setupTokenResult = await paypalClient.createSetupToken({
        returnUrl,
        cancelUrl,
        requestId,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to create setup token";
      return reply.status(502).send({
        error: `PayPal setup token error: ${msg}`,
      });
    }

    // 2. In DB transaction: revoke previous active mandates and create new mandate
    const createdAt = new Date().toISOString();
    const signature = signMandate(rules, mandateId, createdAt);
    const publicKey = getPublicKeyPem();

    const created = await prisma.$transaction(async (tx) => {
      await tx.mandate.updateMany({
        where: { userId, status: "active" },
        data: { status: "revoked" },
      });

      return await tx.mandate.create({
        data: {
          id: mandateId,
          userId,
          rulesJson: canonicalJson(rules),
          signature,
          publicKey,
          setupTokenId: setupTokenResult.setupTokenId,
          vaultId: null,
          status: "active",
          spentThisMonth: 0,
          createdAt: new Date(createdAt),
        },
      });
    });

    // Write hash-chained receipt for mandate creation
    await appendReceipt(mandateId, "mandate_created", {
      mandateId,
      userId,
      rules,
      createdAt,
      setupTokenId: setupTokenResult.setupTokenId,
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
      approveUrl: setupTokenResult.approveUrl,
    });
  });

  // POST /mandates/:id/vault/complete (NO body)
  server.post("/mandates/:id/vault/complete", async (request, reply) => {
    const { id } = request.params as { id: string };
    const mandate = await prisma.mandate.findUnique({
      where: { id },
    });

    if (!mandate) {
      return reply.status(404).send({
        error: `Mandate "${id}" not found`,
      });
    }

    if (mandate.status === "revoked") {
      return reply.status(409).send({
        error: `Cannot complete vault for revoked mandate "${id}"`,
      });
    }

    const sumCents = await getSpentThisMonthCents(id);
    const spentThisMonth = Number((sumCents / 100).toFixed(2));

    // If vaultId already set, return unchanged (idempotent)
    if (mandate.vaultId) {
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
    }

    if (!mandate.setupTokenId) {
      return reply.status(400).send({
        error: `Mandate "${id}" does not have a setup token to exchange`,
      });
    }

    let paymentTokenResult: { vaultId: string };
    try {
      paymentTokenResult = await paypalClient.createPaymentToken(
        mandate.setupTokenId,
        randomUUID()
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to exchange setup token";
      return reply.status(502).send({
        error: `PayPal payment token error: ${msg}`,
      });
    }

    const rules = JSON.parse(mandate.rulesJson);
    const newSignature = signMandate(
      rules,
      mandate.id,
      mandate.createdAt.toISOString(),
      paymentTokenResult.vaultId
    );

    const updated = await prisma.mandate.update({
      where: { id },
      data: {
        vaultId: paymentTokenResult.vaultId,
        signature: newSignature,
      },
    });

    await appendReceipt(id, "mandate_updated", {
      mandateId: id,
      vaultId: paymentTokenResult.vaultId,
      signature: newSignature,
      updatedAt: new Date().toISOString(),
    });

    return reply.send({
      id: updated.id,
      userId: updated.userId,
      rules: JSON.parse(updated.rulesJson),
      signature: updated.signature,
      publicKey: updated.publicKey,
      vaultId: updated.vaultId,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
      spentThisMonth,
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

    const sumCents = await getSpentThisMonthCents(id);
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

  // POST /mandates/:id/pause and /mandates/:id/resume
  // Anita's emergency stop: while paused, /check rejects every cart ("mandate is paused"),
  // so the agent cannot spend anything. Resuming restores the same signed rules.
  const setStatus = (next: "active" | "paused") => async (request: { params: unknown }, reply: { status: (n: number) => { send: (b: unknown) => unknown }; send: (b: unknown) => unknown }) => {
    const { id } = request.params as { id: string };
    const mandate = await prisma.mandate.findUnique({ where: { id } });
    if (!mandate) return reply.status(404).send({ error: `Mandate "${id}" not found` });
    if (mandate.status === "revoked") return reply.status(409).send({ error: "This mandate was replaced by newer rules and cannot be resumed." });
    if (mandate.status !== next) {
      await prisma.mandate.update({ where: { id }, data: { status: next } });
      await appendReceipt(id, "mandate_updated", { mandateId: id, status: next, updatedAt: new Date().toISOString() });
      publish({
        type: "mandate",
        mandateId: id,
        summary: next === "paused" ? "Spending paused: the agent cannot buy anything" : "Spending resumed under the same signed rules",
        at: new Date().toISOString(),
      });
    }
    return reply.send({ id, status: next });
  };
  server.post("/mandates/:id/pause", setStatus("paused"));
  server.post("/mandates/:id/resume", setStatus("active"));
}
