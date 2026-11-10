import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { verifyChain } from "../receipts.js";

const querySchema = z.object({
  mandateId: z.string().min(1, "mandateId query parameter is required"),
});

export async function receiptRoutes(server: FastifyInstance) {
  // GET /receipts/verify?mandateId=
  server.get("/receipts/verify", async (request, reply) => {
    const parseResult = querySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid query parameters",
        reasons: parseResult.error.issues.map(
          (i) => `${i.path.join(".") || "query"}: ${i.message}`
        ),
      });
    }

    const { mandateId } = parseResult.data;
    const mandate = await prisma.mandate.findUnique({
      where: { id: mandateId },
    });

    if (!mandate) {
      return reply.status(404).send({
        error: `Mandate "${mandateId}" not found`,
      });
    }

    const result = await verifyChain(mandateId);
    return reply.send({
      ok: result.ok,
      brokenSeq: result.brokenSeq ?? null,
      checked: result.checked,
    });
  });

  // GET /receipts?mandateId= (newest first)
  server.get("/receipts", async (request, reply) => {
    const parseResult = querySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid query parameters",
        reasons: parseResult.error.issues.map(
          (i) => `${i.path.join(".") || "query"}: ${i.message}`
        ),
      });
    }

    const { mandateId } = parseResult.data;
    const mandate = await prisma.mandate.findUnique({
      where: { id: mandateId },
    });

    if (!mandate) {
      return reply.status(404).send({
        error: `Mandate "${mandateId}" not found`,
      });
    }

    const receipts = await prisma.receipt.findMany({
      where: { mandateId },
      orderBy: { seq: "desc" },
    });

    return reply.send(
      receipts.map((r) => ({
        id: r.id,
        mandateId: r.mandateId,
        seq: r.seq,
        type: r.type,
        payload: r.payload,
        prevHash: r.prevHash,
        hash: r.hash,
        createdAt: r.createdAt.toISOString(),
      }))
    );
  });
}
