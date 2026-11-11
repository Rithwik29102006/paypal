/**
 * Turns Mandate's data into plain sentences for the dashboard, so people read
 * what happened instead of IDs, hashes and tables.
 */
import type { Category } from "@mandate/shared";
import type { Receipt } from "./receipts";

export const CATEGORY_LABEL: Record<Category, string> = {
  groceries: "groceries",
  school: "school supplies",
  household: "household items",
  electronics: "electronics",
  gift_cards: "gift cards",
  crypto: "crypto",
  luxury: "luxury goods",
};

/** "$9" for whole dollars, "$8.98" otherwise. */
export function money(n: number | string | undefined | null): string {
  const v = typeof n === "string" ? Number(n) : n ?? 0;
  if (!Number.isFinite(v)) return "";
  return Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`;
}

/** ["a","b","c"] -> "a, b and c" */
export function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function categoriesSentence(cats: Category[]): string {
  return listOf(cats.map((c) => CATEGORY_LABEL[c] ?? c.replace("_", " ")));
}

/** "a few minutes ago", "yesterday at 9:14 PM" */
export function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 45) return "just now";
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))} min ago`;
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const today = new Date();
  const yest = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return `today at ${time}`;
  if (d.toDateString() === yest.toDateString()) return `yesterday at ${time}`;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${time}`;
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === new Date(today.getTime() - 86400000).toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/** Mandate's reason strings are short but technical; say them the way Anita would. */
export function humanReason(r: string): string {
  if (/risk|threshold/i.test(r))
    return "The store page looked like it was trying to trick the agent.";
  const ask = r.match(/total\s*([\d.]+)\s*is above your ask-me amount\s*([\d.]+)/i);
  if (ask) return `It comes to ${money(Number(ask[1]))}, more than the ${money(Number(ask[2]))} ask-me amount.`;
  let out = r;
  for (const [k, v] of Object.entries(CATEGORY_LABEL)) out = out.replace(new RegExp(`\\b${k}\\b`, "gi"), v);
  out = out
    .replace(/\bperTxCap\b/g, "single-purchase limit")
    .replace(/\bmonthlyCap\b/g, "monthly limit")
    .replace(/\s{2,}/g, " ")
    .trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export type Tone = "go" | "ask" | "stop" | "info";

export interface ActivityLine {
  tone: Tone;
  title: string;
  detail?: string;
}

/** One receipt in the tamper-proof log, as a sentence. */
export function describeReceipt(r: Receipt): ActivityLine {
  const p = r.payload ?? {};
  const items: string[] = Array.isArray(p.items) ? p.items.map((i: { name?: string; sku?: string }) => i.name ?? i.sku ?? "item") : [];
  const what = items.length ? listOf(items.slice(0, 3)) + (items.length > 3 ? ` and ${items.length - 3} more` : "") : undefined;
  const total = p.total ?? p.amount;
  switch (r.type as string) {
    case "mandate_created":
      return { tone: "info", title: "Anita signed her spending rules", detail: "Every purchase from here on is checked against them." };
    case "mandate_updated":
      return { tone: "info", title: "Spending rules updated and signed again" };
    case "mandate_revoked":
      return { tone: "info", title: "An older set of rules was retired" };
    case "check": {
      const d = p.decision as string | undefined;
      const reasons: string[] = Array.isArray(p.reasons) ? p.reasons.map(humanReason).filter(Boolean) : [];
      if (d === "block")
        return { tone: "stop", title: `Stopped a purchase${total ? ` of ${money(total)}` : ""}`, detail: reasons[0] ?? what };
      if (d === "needs_approval")
        return { tone: "ask", title: `Asked Anita before spending ${total ? money(total) : "more than usual"}`, detail: reasons[0] ?? what };
      return { tone: "go", title: `Cleared a cart${total ? ` of ${money(total)}` : ""} against the rules`, detail: what };
    }
    case "approval":
      return /reject|declin/i.test(JSON.stringify(p))
        ? { tone: "stop", title: "Anita declined a purchase" }
        : { tone: "go", title: "Anita approved a purchase" };
    case "payment": {
      const s = String(p.status ?? "");
      if (/captur|complete/i.test(s)) return { tone: "go", title: `Paid ${total ? money(total) : ""} with PayPal`.replace("  ", " "), detail: what };
      if (/created|pending/i.test(s)) return { tone: "ask", title: "PayPal order created, waiting for the buyer to approve", detail: what };
      if (/fail|error/i.test(s)) return { tone: "stop", title: "A PayPal payment did not go through" };
      return { tone: "info", title: "PayPal payment update", detail: what };
    }
    case "dispute":
      return { tone: "ask", title: "A buyer opened a dispute with PayPal" };
    case "dispute_evidence":
      return { tone: "go", title: "Sent proof to PayPal for a dispute", detail: "Signed rules, the check result and these receipts." };
    default:
      return { tone: "info", title: "Recorded an event" };
  }
}

export function disputeReason(reason: string | null): string {
  switch (reason) {
    case "UNAUTHORISED":
      return "The buyer says they never authorised this payment.";
    case "MERCHANDISE_OR_SERVICE_NOT_RECEIVED":
      return "The buyer says the order never arrived.";
    case "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED":
      return "The buyer says the order was not as described.";
    case "DUPLICATE_TRANSACTION":
      return "The buyer says they were charged twice.";
    default:
      return "The buyer questioned this payment.";
  }
}
