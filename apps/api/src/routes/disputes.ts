/**
 * GET  /disputes                     -> DisputeView[] (newest first), with evidence for the drawer
 * GET  /disputes/:id                 -> DisputeView
 * GET  /disputes/:id/evidence.pdf    -> the one-page PDF sent to PayPal
 * POST /disputes/:id/defend          -> build + submit evidence (also runs automatically on CUSTOMER.DISPUTE.CREATED)
 * POST /disputes/:id/sandbox-resolve -> { outcome: "won" | "lost" }; SANDBOX/MOCK ONLY, asks PayPal to rule (adjudicate)
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { buildEvidence, defendDispute, DisputeError, sandboxResolve, toView } from "../disputes.js";
import { renderEvidencePdf } from "../evidencePdf.js";
import type { PayPalClient } from "../paypal/types.js";

const fail = (reply: FastifyReply, err: unknown) => {
  if (err instanceof DisputeError) return reply.status(err.statusCode).send({ error: err.message });
  throw err;
};

export async function disputeRoutes(server: FastifyInstance, paypal: PayPalClient) {
  server.get("/disputes", async () => {
    const rows = await prisma.dispute.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map(toView);
  });

  server.get<{ Params: { id: string } }>("/disputes/:id", async (request, reply) => {
    const row = await prisma.dispute.findUnique({ where: { id: request.params.id } });
    if (!row) return reply.status(404).send({ error: "dispute not found" });
    return toView(row);
  });

  server.get<{ Params: { id: string } }>("/disputes/:id/evidence.pdf", async (request, reply) => {
    try {
      const pdf = await renderEvidencePdf(await buildEvidence(request.params.id));
      return reply
        .header("content-type", "application/pdf")
        .header("content-disposition", `inline; filename="mandate-evidence-${request.params.id}.pdf"`)
        .send(pdf);
    } catch (err) {
      return fail(reply, err);
    }
  });

  server.post<{ Params: { id: string } }>("/disputes/:id/defend", async (request, reply) => {
    try {
      return await defendDispute(request.params.id, paypal);
    } catch (err) {
      return fail(reply, err);
    }
  });

  const ResolveBody = z.object({ outcome: z.enum(["won", "lost"]) });
  server.post<{ Params: { id: string } }>("/disputes/:id/sandbox-resolve", async (request, reply) => {
    const parsed = ResolveBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: "body must be { outcome: 'won' | 'lost' }" });
    try {
      return await sandboxResolve(request.params.id, parsed.data.outcome, paypal);
    } catch (err) {
      return fail(reply, err);
    }
  });
}
