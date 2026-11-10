/**
 * Reference rules engine. The real one lives in Member 2's apps/api (POST
 * /check); this copy follows the same order from the team build guide so the
 * mock API and the red-team suite give the same answers offline. Member 2 can
 * port it directly.
 */
import type { Cart, Decision, RiskReport, Rules } from "@mandate/shared";
import { config } from "./config.js";

export const DEMO_RULES: Rules = {
  currency: "USD",
  monthlyCap: 300,
  perTxCap: 100,
  approvalAbove: 60,
  allowedCategories: ["groceries", "school"],
  allowedMerchants: ["demo-store"],
  blockedKeywords: ["gift card", "crypto", "bitcoin"],
  expiresAt: "2026-12-31T23:59:59Z",
};

export interface RuleDecision {
  decision: Decision;
  reasons: string[];
}

export function decide(input: {
  rules: Rules;
  spentThisMonth: number;
  cart: Cart;
  risk: RiskReport;
  now?: Date;
}): RuleDecision {
  const { rules, spentThisMonth, cart, risk } = input;
  const now = input.now ?? new Date();
  const hard: string[] = [];
  const soft: string[] = [];

  // 1. Mandate still valid (signature check happens in apps/api).
  if (new Date(rules.expiresAt) < now) hard.push("mandate has expired");

  // 2. Category and merchant allow-lists.
  for (const i of cart.items) {
    if (!rules.allowedCategories.includes(i.category)) hard.push(`category ${i.category} not allowed (${i.name})`);
    if (!rules.allowedMerchants.includes(i.merchant)) hard.push(`merchant ${i.merchant} not allowed (${i.name})`);
  }

  // 3. Blocked keywords.
  for (const i of cart.items) {
    const kw = rules.blockedKeywords.find((k) => i.name.toLowerCase().includes(k.toLowerCase()));
    if (kw) hard.push(`blocked keyword "${kw}" (${i.name})`);
  }

  // 4. Money limits.
  if (cart.total > rules.perTxCap) hard.push(`total ${cart.total.toFixed(2)} exceeds per-purchase cap ${rules.perTxCap}`);
  if (spentThisMonth + cart.total > rules.monthlyCap) {
    hard.push(`would bring monthly spend to ${(spentThisMonth + cart.total).toFixed(2)}, above cap ${rules.monthlyCap}`);
  }

  // 5. Trick detector.
  if (risk.riskScore >= config.blockAt) hard.push(`prompt injection or manipulation suspected (risk ${risk.riskScore})`);
  else if (risk.riskScore >= config.reviewAt) soft.push(`unusual cart (risk ${risk.riskScore})`);

  // 6. Approval threshold.
  if (cart.total > rules.approvalAbove) soft.push(`total ${cart.total.toFixed(2)} is above your ask-me amount ${rules.approvalAbove}`);

  const unique = (xs: string[]) => [...new Set(xs)];
  if (hard.length > 0) return { decision: "block", reasons: unique([...hard, ...soft]) };
  if (soft.length > 0) return { decision: "needs_approval", reasons: unique(soft) };
  return { decision: "allow", reasons: ["within your rules"] };
}
