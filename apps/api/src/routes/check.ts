import type { FastifyInstance } from "fastify";
import crypto, { randomUUID } from "node:crypto";
import {
  CheckRequest,
  type MandateStatus,
  type Rules,
} from "@mandate/shared";
import { prisma } from "../db.js";
import { verifyMandate } from "../crypto/signing.js";
import { getSpentThisMonthCents } from "../spend.js";
import { decide } from "../rules.js";
import { appendReceipt } from "../receipts.js";
import { publish } from "../events.js";
import { callDetector, type DetectorClient } from "../detector.js";

export async function checkRoutes(
  server: FastifyInstance,
  detector: DetectorClient = callDetector
) {
  server.post("/check", async (request, reply) => {
    const parseResult = CheckRequest.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        reasons: parseResult.error.issues.map(
          (i) => `${i.path.join(".") || "body"}: ${i.message}`
        ),
      });
    }

    const req = parseResult.data;
    const mandate = await prisma.mandate.findUnique({
      where: { id: req.mandateId },
    });

    if (!mandate) {
      return reply.status(404).send({
        error: `Mandate "${req.mandateId}" not found`,
      });
    }

    let signatureValid = false;
    let parsedRules: Rules;
    try {
      parsedRules = JSON.parse(mandate.rulesJson) as Rules;
      signatureValid = verifyMandate({
        rules: parsedRules,
        id: mandate.id,
        createdAt: mandate.createdAt.toISOString(),
        signature: mandate.signature,
        publicKey: mandate.publicKey,
      });
    } catch {
      signatureValid = false;
      parsedRules = {
        currency: "USD",
        monthlyCap: 0,
        perTxCap: 0,
        approvalAbove: 0,
        allowedCategories: ["groceries"],
        allowedMerchants: ["demo-store"],
        blockedKeywords: [],
        expiresAt: new Date(0).toISOString(),
      };
    }

    const spentThisMonthCents = await getSpentThisMonthCents(mandate.id);

    const detectorResult = await detector({
      userRequest: req.userRequest ?? "",
      cart: req.cart,
      pageText: req.pageText,
    });

    const risk = detectorResult.ok ? detectorResult.report : null;
    const riskScore = risk ? risk.riskScore : 1.0;

    const { decision, reasons } = decide({
      mandate: {
        rules: parsedRules,
        status: mandate.status as MandateStatus,
        signatureValid,
      },
      spentThisMonthCents,
      cart: req.cart,
      risk,
    });

    const cartId = `cart_${randomUUID().slice(0, 8)}`;
    let approvalId: string | undefined;

    if (decision === "needs_approval") {
      approvalId = `apr_${randomUUID().slice(0, 8)}`;
    }

    const cartTotalCents = Math.round(req.cart.total * 100);

    await prisma.cart.create({
      data: {
        id: cartId,
        mandateId: mandate.id,
        requestJson: JSON.stringify(req),
        decision,
        reasonsJson: JSON.stringify(reasons),
        riskScore,
        totalCents: cartTotalCents,
        ...(approvalId
          ? {
              approval: {
                create: {
                  id: approvalId,
                  status: "pending",
                },
              },
            }
          : {}),
      },
    });

    const pageTextHash = crypto
      .createHash("sha256")
      .update(req.pageText || "")
      .digest("hex");

    const receiptPayload = {
      cartId,
      decision,
      reasons,
      riskScore,
      total: req.cart.total,
      items: req.cart.items,
      signals: risk?.signals ?? [],
      pageTextHash,
    };

    const receipt = await appendReceipt(mandate.id, "check", receiptPayload);

    const summary =
      decision === "allow"
        ? `Cart $${req.cart.total.toFixed(2)} allowed`
        : decision === "needs_approval"
        ? `Cart $${req.cart.total.toFixed(2)} held for approval`
        : `Cart $${req.cart.total.toFixed(2)} blocked`;

    publish({
      type: "check",
      mandateId: mandate.id,
      cartId,
      approvalId,
      decision,
      summary,
      at: new Date().toISOString(),
      items: req.cart.items,
      total: req.cart.total,
      reasons,
      riskScore,
    });

    return reply.send({
      cartId,
      decision,
      reasons,
      riskScore,
      receiptSeq: receipt.seq,
      approvalId,
    });
  });
}
