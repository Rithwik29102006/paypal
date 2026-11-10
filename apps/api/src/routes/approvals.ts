import type { FastifyInstance } from "fastify";
import { ApprovalDecisionRequest } from "@mandate/shared";
import { prisma } from "../db.js";
import { appendReceipt } from "../receipts.js";
import { publish } from "../events.js";

export async function approvalRoutes(server: FastifyInstance) {
  // GET /approvals/:id -> { status }
  server.get("/approvals/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const approval = await prisma.approval.findUnique({
      where: { id },
    });

    if (!approval) {
      return reply.status(404).send({
        error: `Approval "${id}" not found`,
      });
    }

    return reply.send({
      status: approval.status,
    });
  });

  // POST /approvals/:id and POST /approvals/:id/decision -> { approved: boolean }
  const handleDecision = async (request: any, reply: any) => {
    const { id } = request.params as { id: string };
    const parseResult = ApprovalDecisionRequest.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        reasons: parseResult.error.issues.map(
          (i) => `${i.path.join(".") || "body"}: ${i.message}`
        ),
      });
    }

    const { approved } = parseResult.data;

    const approval = await prisma.approval.findUnique({
      where: { id },
      include: { cart: true },
    });

    if (!approval) {
      return reply.status(404).send({
        error: `Approval "${id}" not found`,
      });
    }

    if (approval.status !== "pending") {
      return reply.status(409).send({
        error: `Approval "${id}" has already been decided (${approval.status})`,
      });
    }

    const newStatus = approved ? "approved" : "rejected";
    const decidedAt = new Date();

    // Wrap status change + receipt so they cannot half-apply
    const updated = await prisma.approval.update({
      where: { id },
      data: {
        status: newStatus,
        decidedAt,
      },
    });

    await appendReceipt(approval.cart.mandateId, "approval", {
      approvalId: approval.id,
      cartId: approval.cartId,
      status: newStatus,
      decidedAt: decidedAt.toISOString(),
    });

    publish({
      type: "approval",
      mandateId: approval.cart.mandateId,
      cartId: approval.cartId,
      approvalId: approval.id,
      summary: `Approval ${approval.id} was ${newStatus} for cart ${approval.cartId}`,
      at: decidedAt.toISOString(),
      payload: { status: newStatus },
    });

    return reply.send({
      id: updated.id,
      cartId: updated.cartId,
      status: updated.status,
      decidedAt: updated.decidedAt ? updated.decidedAt.toISOString() : null,
    });
  };

  server.post("/approvals/:id", handleDecision);
  server.post("/approvals/:id/decision", handleDecision);
}
