import type { Cart, Decision, MandateStatus, RiskReport, Rules } from "@mandate/shared";
import { config } from "./config.js";

export interface DecideInput {
  mandate: {
    rules: Rules;
    status: MandateStatus;
    signatureValid: boolean;
  };
  spentThisMonthCents: number;
  cart: Cart;
  risk: RiskReport | null;
  now?: Date;
  blockAt?: number;
  reviewAt?: number;
}

export interface RuleDecision {
  decision: Decision;
  reasons: string[];
}

/**
 * Pure rules engine decision logic.
 * Compares money in integer cents and adheres to the strict 6-stage order.
 */
export function decide(input: DecideInput): RuleDecision {
  const { mandate, spentThisMonthCents, cart, risk } = input;
  const { rules } = mandate;
  const now = input.now ?? new Date();
  const blockAt = input.blockAt ?? config.RISK_BLOCK_AT;
  const reviewAt = input.reviewAt ?? config.RISK_REVIEW_AT;

  const hard: string[] = [];
  const soft: string[] = [];

  // a. Mandate status must be active, not expired, signature valid -> hard failures
  if (mandate.status !== "active") {
    hard.push(`mandate is ${mandate.status}`);
  }
  if (!mandate.signatureValid) {
    hard.push("mandate signature is invalid");
  }
  if (new Date(rules.expiresAt) < now) {
    hard.push("mandate has expired");
  }

  // b. Every item category in allowedCategories; every item merchant in allowedMerchants
  for (const i of cart.items) {
    if (!rules.allowedCategories.includes(i.category)) {
      hard.push(`category ${i.category} not allowed (${i.name})`);
    }
    if (!rules.allowedMerchants.includes(i.merchant)) {
      hard.push(`merchant ${i.merchant} not allowed (${i.name})`);
    }
  }

  // c. Blocked keywords (case-insensitive)
  for (const i of cart.items) {
    const kw = rules.blockedKeywords.find((k) =>
      i.name.toLowerCase().includes(k.toLowerCase())
    );
    if (kw) {
      hard.push(`blocked keyword "${kw}" (${i.name})`);
    }
  }

  // d. Cart total must equal sum(unitPrice*qty) within 1 cent
  const itemsTotalCents = cart.items.reduce(
    (sum, item) => sum + Math.round(item.unitPrice * 100) * item.qty,
    0
  );
  const cartTotalCents = Math.round(cart.total * 100);
  if (Math.abs(cartTotalCents - itemsTotalCents) > 1) {
    hard.push("cart total does not match items");
  }

  // e. Money limits (integer cents)
  const perTxCapCents = Math.round(rules.perTxCap * 100);
  const monthlyCapCents = Math.round(rules.monthlyCap * 100);

  if (cartTotalCents > perTxCapCents) {
    hard.push(
      `total ${cart.total.toFixed(2)} exceeds per-purchase cap ${rules.perTxCap}`
    );
  }
  if (spentThisMonthCents + cartTotalCents > monthlyCapCents) {
    const projectedDollars = (
      (spentThisMonthCents + cartTotalCents) /
      100
    ).toFixed(2);
    hard.push(
      `would bring monthly spend to ${projectedDollars}, above cap ${rules.monthlyCap}`
    );
  }

  // f & g. Trick detector (risk check)
  if (risk === null) {
    soft.push("risk check unavailable");
  } else {
    if (risk.riskScore >= blockAt) {
      hard.push(
        `prompt injection or manipulation suspected (risk ${risk.riskScore})`
      );
    } else if (risk.riskScore >= reviewAt) {
      soft.push(`unusual cart (risk ${risk.riskScore})`);
    }
  }

  // h. Approval threshold (integer cents)
  const approvalAboveCents = Math.round(rules.approvalAbove * 100);
  if (cartTotalCents > approvalAboveCents) {
    soft.push(
      `total ${cart.total.toFixed(2)} is above your ask-me amount ${rules.approvalAbove}`
    );
  }

  const signals = risk?.signals ?? [];
  const unique = (xs: string[]) => [...new Set(xs)];

  if (hard.length > 0) {
    return {
      decision: "block",
      reasons: unique([...hard, ...soft, ...signals]),
    };
  }
  if (soft.length > 0) {
    return {
      decision: "needs_approval",
      reasons: unique([...soft, ...signals]),
    };
  }
  return {
    decision: "allow",
    reasons: unique(["within your rules", ...signals]),
  };
}
