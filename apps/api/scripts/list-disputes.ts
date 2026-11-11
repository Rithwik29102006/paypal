/**
 * List the PayPal sandbox disputes on the merchant account in apps/api/.env
 * (handy when you forgot to copy the PP-D-... id).
 *
 *   pnpm --filter @mandate/api list:disputes
 */
import { config } from "../src/config.js";
import { SandboxPayPal } from "../src/paypal/sandbox.js";

type DisputeSummary = {
  dispute_id: string;
  status: string;
  reason?: string;
  create_time?: string;
  dispute_amount?: { value: string; currency_code: string };
  disputed_transactions?: { seller_transaction_id?: string }[];
};

async function main() {
  if (config.PAYPAL_MODE !== "sandbox") {
    console.error("list:disputes talks to the real PayPal sandbox; set PAYPAL_MODE=sandbox in apps/api/.env.");
    process.exit(1);
  }
  const { accessToken } = await new SandboxPayPal().getAccessToken();
  const res = await fetch("https://api-m.sandbox.paypal.com/v1/customer/disputes?page_size=20", {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    console.error(`PayPal returned ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const data = (await res.json()) as { items?: DisputeSummary[] };
  const items = data.items ?? [];
  if (items.length === 0) {
    console.log("No disputes on this merchant account yet. Sandbox disputes can take a few minutes to appear; try again shortly.");
    return;
  }
  for (const d of items) {
    const amount = d.dispute_amount ? `${d.dispute_amount.value} ${d.dispute_amount.currency_code}` : "?";
    console.log(`${d.dispute_id}  ${d.status.padEnd(30)} ${(d.reason ?? "").padEnd(24)} ${amount.padEnd(10)} ${d.create_time ?? ""}`);
  }
  console.log(`\nImport and defend one with: pnpm --filter @mandate/api import:dispute ${items[0].dispute_id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
