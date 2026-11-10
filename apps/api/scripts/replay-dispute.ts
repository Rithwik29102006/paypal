/**
 * REPLAY a recorded CUSTOMER.DISPUTE.CREATED webhook against a captured
 * payment. MOCK MODE ONLY: it is not a real PayPal dispute, and the output says
 * so. Use it for local demos when sandbox disputes are slow to appear.
 *
 *   pnpm --filter @mandate/api replay:dispute               # latest captured payment
 *   pnpm --filter @mandate/api replay:dispute -- <cartId>   # a specific cart
 *   pnpm --filter @mandate/api replay:dispute -- --win      # also record a (mock) ruling in your favour
 *
 * Needs the API running (pnpm api) with PAYPAL_MODE=mock.
 */
import { randomUUID } from "node:crypto";
import { config } from "../src/config.js";
import { prisma } from "../src/db.js";

const args = process.argv.slice(2).filter((a) => a !== "--");
const win = args.includes("--win");
const cartArg = args.find((a) => !a.startsWith("--"));
const api = config.API_PUBLIC_URL;

async function main() {
  if (config.PAYPAL_MODE !== "mock") {
    console.error("replay:dispute only works in PAYPAL_MODE=mock. For a real sandbox dispute use: pnpm --filter @mandate/api import:dispute -- <PP-D-...>");
    process.exit(1);
  }
  const payment = await prisma.payment.findFirst({
    where: { status: "captured", captureId: { not: null }, ...(cartArg ? { cartId: cartArg } : {}) },
    orderBy: { createdAt: "desc" },
  });
  if (!payment?.captureId) {
    console.error("No captured payment found. Make a purchase first (pnpm demo with MOCK_API=0, or the agent).");
    process.exit(1);
  }

  const disputeId = `PP-D-REPLAY-${randomUUID().slice(0, 8).toUpperCase()}`;
  const event = {
    id: `WH-REPLAY-${randomUUID()}`,
    event_type: "CUSTOMER.DISPUTE.CREATED",
    resource: {
      dispute_id: disputeId,
      reason: "UNAUTHORISED",
      status: "WAITING_FOR_SELLER_RESPONSE",
      dispute_amount: { currency_code: "USD", value: (payment.amountCents / 100).toFixed(2) },
      disputed_transactions: [{ seller_transaction_id: payment.captureId }],
    },
  };

  console.log(`REPLAY (not a real PayPal dispute): "${event.resource.reason}" on cart ${payment.cartId}, capture ${payment.captureId}`);
  const res = await fetch(`${api}/webhooks/paypal`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mock-webhook": "replay" },
    body: JSON.stringify(event),
  });
  console.log(`webhook -> ${res.status} ${await res.text()}`);

  const dispute = await prisma.dispute.findUnique({ where: { disputeId } });
  if (!dispute) throw new Error("dispute was not recorded; is the API running in mock mode?");
  console.log(`dispute ${dispute.id} (${disputeId}): ${dispute.status}${dispute.lastError ? ` (${dispute.lastError})` : ""}`);

  if (win) {
    const r = await fetch(`${api}/disputes/${dispute.id}/sandbox-resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outcome: "won" }),
    });
    const body = (await r.json()) as { status?: string; error?: string };
    console.log(`mock ruling -> ${r.status} ${body.status ?? body.error}`);
  }
  console.log(`evidence PDF: ${api}/disputes/${dispute.id}/evidence.pdf`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
