/**
 * POST /webhooks/paypal
 *
 * - Verifies the signature on the RAW body (PayPal signs the exact bytes), via
 *   POST /v1/notifications/verify-webhook-signature in sandbox mode. In mock
 *   mode only requests with the x-mock-webhook header are accepted.
 * - Ignores duplicate deliveries (WebhookEvent.eventId is unique).
 * - Always answers 200 for verified events, even if processing fails, so PayPal
 *   does not retry forever; failures are stored on the WebhookEvent row.
 */
import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { defendDispute, outcomeToStatus, recordDispute, setOutcome, type DisputeResource } from "../disputes.js";
import type { PayPalClient } from "../paypal/types.js";

interface WebhookEvent {
  id?: string;
  event_type?: string;
  resource?: Record<string, unknown>;
}

export async function webhookRoutes(server: FastifyInstance, paypal: PayPalClient) {
  await server.register(async (app) => {
    // Keep the raw string body in this plugin only (other routes still get parsed JSON).
    app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => done(null, body));

    app.post("/webhooks/paypal", async (request, reply) => {
      const rawBody = typeof request.body === "string" ? request.body : "";
      let event: WebhookEvent;
      try {
        event = JSON.parse(rawBody) as WebhookEvent;
      } catch {
        return reply.status(400).send({ error: "invalid JSON body" });
      }
      if (!event.id || !event.event_type) return reply.status(400).send({ error: "missing event id or event_type" });

      let verified = false;
      try {
        verified = await paypal.verifyWebhook({ headers: request.headers, rawBody });
      } catch (err) {
        request.log.error({ err: (err as Error).message }, "webhook verification call failed");
        return reply.status(502).send({ error: "could not verify webhook signature" });
      }
      if (!verified) return reply.status(400).send({ error: "webhook signature verification failed" });

      const duplicate = await prisma.webhookEvent.findUnique({ where: { eventId: event.id } });
      if (duplicate) return reply.status(200).send({ ok: true, duplicate: true });

      const resource = event.resource ?? {};
      let status = "processed";
      let result: unknown = null;
      try {
        result = await handleEvent(event.event_type, resource, paypal);
        if (result === "ignored") status = "ignored";
      } catch (err) {
        status = "error";
        request.log.error({ err: (err as Error).message, eventType: event.event_type }, "webhook processing failed");
      }

      await prisma.webhookEvent
        .create({
          data: {
            eventId: event.id,
            eventType: event.event_type,
            resourceId: String(resource.id ?? resource.dispute_id ?? "") || null,
            payload: rawBody,
            status,
          },
        })
        .catch(() => undefined); // a concurrent duplicate delivery already stored it

      return reply.status(200).send({ ok: true, status });
    });
  });
}

async function handleEvent(type: string, resource: Record<string, unknown>, paypal: PayPalClient): Promise<unknown> {
  switch (type) {
    case "PAYMENT.CAPTURE.COMPLETED":
    case "PAYMENT.CAPTURE.DENIED": {
      const captureId = typeof resource.id === "string" ? resource.id : null;
      if (!captureId) return "ignored";
      const status = type === "PAYMENT.CAPTURE.COMPLETED" ? "captured" : "failed";
      const { count } = await prisma.payment.updateMany({ where: { captureId }, data: { status } });
      return count > 0 ? { captureId, status } : "ignored";
    }

    case "CUSTOMER.DISPUTE.CREATED": {
      const dispute = await recordDispute(resource as DisputeResource);
      // Defend automatically when we can link it to one of our payments.
      if (dispute.paymentId && dispute.status === "open") {
        await defendDispute(dispute.id, paypal).catch(() => undefined); // error is stored on the row; retry via POST /disputes/:id/defend
      }
      return { disputeId: dispute.disputeId };
    }

    case "CUSTOMER.DISPUTE.UPDATED":
    case "CUSTOMER.DISPUTE.RESOLVED": {
      const r = resource as DisputeResource;
      const disputeId = r.dispute_id ?? r.id;
      if (!disputeId) return "ignored";
      const outcome = outcomeToStatus(r.dispute_outcome?.outcome_code);
      if (outcome) await setOutcome(disputeId, outcome, `PayPal webhook ${type}`);
      return { disputeId, outcome };
    }

    case "VAULT.PAYMENT-TOKEN.CREATED":
      // Vault completion is driven by POST /mandates/:id/vault/complete; nothing to do.
      return "ignored";

    default:
      return "ignored";
  }
}
