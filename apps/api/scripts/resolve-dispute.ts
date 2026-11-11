/**
 * SANDBOX ONLY. Show a real sandbox dispute's state and ask PayPal to rule on it
 * (adjudicate). PayPal only allows this while the dispute is UNDER_REVIEW and
 * offers an "adjudicate" link; the script tells you if it is not there yet.
 *
 *   pnpm --filter @mandate/api resolve:dispute PP-R-...        (rule for the seller = WON)
 *   pnpm --filter @mandate/api resolve:dispute PP-R-... --lost (rule for the buyer)
 *   add --force to try adjudicate even when PayPal does not offer the link
 */
import { randomUUID } from "node:crypto";
import { config } from "../src/config.js";
import { prisma } from "../src/db.js";
import { setOutcome } from "../src/disputes.js";
import { getPayPalClient } from "../src/paypal/client.js";

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const disputeId = args.find((a) => !a.startsWith("--"));
  const lost = args.includes("--lost");
  const force = args.includes("--force"); // try adjudicate even without the link
  if (!disputeId) {
    console.error("usage: pnpm --filter @mandate/api resolve:dispute <PP-...> [--lost]");
    process.exit(1);
  }
  if (config.PAYPAL_MODE !== "sandbox") {
    console.error("resolve:dispute talks to the real PayPal sandbox; set PAYPAL_MODE=sandbox in apps/api/.env.");
    process.exit(1);
  }
  const paypal = getPayPalClient();
  const details = await paypal.getDispute(disputeId);
  const raw = (details.raw ?? {}) as { links?: { rel: string; href: string }[]; dispute_life_cycle_stage?: string; dispute_outcome?: { outcome_code?: string } };
  const rels = (raw.links ?? []).map((l) => l.rel);
  console.log(`PayPal: ${disputeId} status=${details.status} stage=${raw.dispute_life_cycle_stage ?? "?"} links=[${rels.join(", ")}]`);

  if (details.status === "RESOLVED") {
    const code = raw.dispute_outcome?.outcome_code ?? "";
    const outcome = code.includes("SELLER") ? "won" : code.includes("BUYER") ? "lost" : null;
    console.log(`Already resolved by PayPal: ${code || "unknown outcome"}`);
    if (outcome) {
      await setOutcome(disputeId, outcome, `PayPal sandbox ruling (${code})`);
      console.log(`Saved in Mandate as ${outcome.toUpperCase()}. Refresh /disputes.`);
    }
    return;
  }
  if (!rels.includes("adjudicate") && !force) {
    console.log(
      details.status === "UNDER_REVIEW"
        ? "PayPal is reviewing but has not offered 'adjudicate' yet. Wait a minute and run this again."
        : `PayPal only allows a ruling while the dispute is UNDER_REVIEW (it is ${details.status}). ` +
            "After evidence is submitted the sandbox usually moves it there within a few minutes; run this again shortly."
    );
    process.exit(2);
  }
  await paypal.adjudicate(disputeId, lost ? "BUYER_FAVOR" : "SELLER_FAVOR", randomUUID());
  const outcome = lost ? "lost" : "won";
  await setOutcome(disputeId, outcome, "PayPal sandbox ruling");
  console.log(`PayPal ruled for the ${lost ? "buyer" : "seller"}: Mandate shows ${outcome.toUpperCase()}. Refresh /disputes.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
