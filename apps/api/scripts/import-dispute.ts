/**
 * Import a REAL PayPal sandbox dispute by id and defend it, without needing
 * the webhook to reach your machine (handy before the Render URL / ngrok is
 * set up as the webhook target).
 *
 *   PAYPAL_MODE=sandbox pnpm --filter @mandate/api import:dispute -- PP-D-12345
 *
 * How to get a sandbox dispute: log in to sandbox.paypal.com as the buyer
 * (Personal) account, open the captured payment, "Report a problem", and file
 * an unauthorised-transaction dispute. Copy the PP-D-... id.
 */
import { defendDispute, recordDispute, type DisputeResource } from "../src/disputes.js";
import { config } from "../src/config.js";
import { prisma } from "../src/db.js";
import { getPayPalClient } from "../src/paypal/client.js";

async function main() {
  const disputeId = process.argv.slice(2).find((a) => a !== "--");
  if (!disputeId) {
    console.error("usage: pnpm --filter @mandate/api import:dispute -- <PP-D-...>");
    process.exit(1);
  }
  if (config.PAYPAL_MODE !== "sandbox") {
    console.error("import:dispute talks to the real PayPal sandbox; set PAYPAL_MODE=sandbox in apps/api/.env.");
    process.exit(1);
  }

  const paypal = getPayPalClient();
  const details = await paypal.getDispute(disputeId);
  console.log(`PayPal sandbox dispute ${details.disputeId}: status ${details.status}, reason ${details.reason ?? "?"}`);

  const row = await recordDispute((details.raw ?? { dispute_id: disputeId }) as DisputeResource);
  if (!row.paymentId) {
    console.error(`Recorded, but not linked: ${row.lastError}`);
    process.exit(1);
  }
  const view = await defendDispute(row.id, paypal);
  console.log(`Evidence submitted to PayPal: dispute ${view.id} is ${view.status}.`);
  console.log(`Ask the sandbox to rule (sandbox only): POST ${config.API_PUBLIC_URL}/disputes/${view.id}/sandbox-resolve {"outcome":"won"}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
