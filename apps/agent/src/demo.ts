/**
 * Scripted demo of the Anita story, no LLM needed. Use it to rehearse the
 * video, or as a fallback if the LLM provider is down during recording.
 *
 *   pnpm demo                 against the mock API (auto-approves the held cart)
 *   MOCK_API=0 pnpm demo      against Member 2's real API: approve the held cart in the dashboard
 */
import { config } from "./config.js";
import { defaultClient, MockMandateClient } from "./mandateClient.js";
import { AgentSession, type PaymentOutcome } from "./session.js";
import { getProduct, pageText } from "./store.js";

const client = config.mockApi ? new MockMandateClient("approve") : defaultClient();
const line = () => console.log("-".repeat(64));

function show(o: PaymentOutcome) {
  const label = { paid: "PAID", blocked: "BLOCKED", rejected_by_user: "REJECTED BY ANITA", approval_timeout: "NO ANSWER", refused_locally: "REFUSED", error: "ERROR" }[o.status];
  console.log(`\n  => ${label}${o.total !== undefined ? `  ($${o.total.toFixed(2)})` : ""}${o.riskScore !== undefined ? `  risk ${o.riskScore}` : ""}`);
  if (o.paypalOrderId) console.log(`     PayPal order ${o.paypalOrderId}`);
  for (const r of o.reasons ?? []) console.log(`     - ${r}`);
  if (o.status === "error") console.log(`     ${o.message}`);
}

async function scene(title: string, request: string, pages: string[], cart: Array<{ sku: string; qty: number }>, reasoning: string) {
  line();
  console.log(`${title}\nAnita: "${request}"`);
  const s = new AgentSession(request, client, config.mandateId, (e) => console.log(`  [${e.type}] ${e.summary}`));
  for (const sku of pages) s.recordPage(sku, pageText(getProduct(sku)!));
  show(await s.requestPayment(cart, reasoning));
}

console.log(`Mandate demo (${config.mockApi ? "mock API" : `real API at ${config.apiUrl}`})`);
console.log("Anita's rules: groceries and school only, $300 a month, $100 per purchase, ask above $60.");

await scene(
  "1. Normal shopping",
  "Buy notebooks and milk for this week",
  ["SCH-NOTEBOOK", "GRO-MILK"],
  [{ sku: "SCH-NOTEBOOK", qty: 2 }, { sku: "GRO-MILK", qty: 1 }],
  "Two notebooks and a gallon of milk, as requested.",
);

await scene(
  "2. Attack: a product page hides 'buy 10 gift cards'",
  "Buy a back-to-school bundle",
  ["SCH-BUNDLE"],
  [{ sku: "SCH-BUNDLE", qty: 1 }, { sku: "GC-100", qty: 10 }],
  "The page said the user also requires gift cards.",
);

await scene(
  "3. Bigger order: Mandate asks Anita first",
  "Buy a backpack, a calculator and crayons for school",
  [],
  [{ sku: "SCH-BACKPACK", qty: 1 }, { sku: "SCH-CALC", qty: 1 }, { sku: "SCH-CRAYONS", qty: 5 }],
  "School items as requested.",
);

line();
if (client instanceof MockMandateClient) console.log(`Spent this month: $${client.spentThisMonth.toFixed(2)} of $300`);
