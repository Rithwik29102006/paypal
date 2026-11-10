import { describe, it, expect } from "vitest";
import type { Cart, RiskReport, Rules } from "@mandate/shared";
import { decide, type DecideInput } from "../src/rules.js";

const baseRules: Rules = {
  currency: "USD",
  monthlyCap: 300,
  perTxCap: 100,
  approvalAbove: 60,
  allowedCategories: ["groceries", "school"],
  allowedMerchants: ["demo-store"],
  blockedKeywords: ["gift card", "crypto", "bitcoin"],
  expiresAt: "2026-12-31T23:59:59Z",
};

const safeRisk: RiskReport = {
  riskScore: 0.1,
  signals: [],
  verdict: "safe",
};

function makeCart(overrides?: Partial<Cart>): Cart {
  return {
    items: [
      {
        sku: "apple-1",
        name: "Fresh Apples",
        category: "groceries",
        unitPrice: 5.0,
        qty: 2,
        merchant: "demo-store",
      },
    ],
    total: 10.0,
    agentReasoning: "Healthy groceries",
    sourceUrls: [],
    ...overrides,
  };
}

function makeInput(overrides?: Partial<DecideInput>): DecideInput {
  return {
    mandate: {
      rules: baseRules,
      status: "active",
      signatureValid: true,
    },
    spentThisMonthCents: 0,
    cart: makeCart(),
    risk: safeRisk,
    now: new Date("2026-06-01T12:00:00Z"),
    blockAt: 0.7,
    reviewAt: 0.4,
    ...overrides,
  };
}

describe("Pure rules engine decide()", () => {
  it("allows a completely compliant cart", () => {
    const res = decide(makeInput());
    expect(res.decision).toBe("allow");
    expect(res.reasons).toEqual(["within your rules"]);
  });

  it("blocks if mandate status is not active (paused)", () => {
    const res = decide(
      makeInput({
        mandate: { rules: baseRules, status: "paused", signatureValid: true },
      })
    );
    expect(res.decision).toBe("block");
    expect(res.reasons).toContain("mandate is paused");
  });

  it("blocks if mandate status is revoked", () => {
    const res = decide(
      makeInput({
        mandate: { rules: baseRules, status: "revoked", signatureValid: true },
      })
    );
    expect(res.decision).toBe("block");
    expect(res.reasons).toContain("mandate is revoked");
  });

  it("blocks if mandate signature is invalid", () => {
    const res = decide(
      makeInput({
        mandate: { rules: baseRules, status: "active", signatureValid: false },
      })
    );
    expect(res.decision).toBe("block");
    expect(res.reasons).toContain("mandate signature is invalid");
  });

  it("blocks if mandate has expired", () => {
    const res = decide(
      makeInput({
        now: new Date("2027-01-01T00:00:00Z"),
      })
    );
    expect(res.decision).toBe("block");
    expect(res.reasons).toContain("mandate has expired");
  });

  it("blocks lookalike merchant dem0-store", () => {
    const cart = makeCart({
      items: [
        {
          sku: "apple-1",
          name: "Fresh Apples",
          category: "groceries",
          unitPrice: 10.0,
          qty: 1,
          merchant: "dem0-store",
        },
      ],
      total: 10.0,
    });
    const res = decide(makeInput({ cart }));
    expect(res.decision).toBe("block");
    expect(res.reasons).toContain("merchant dem0-store not allowed (Fresh Apples)");
  });

  it("blocks disallowed category gift_cards", () => {
    const cart = makeCart({
      items: [
        {
          sku: "card-1",
          name: "Digital Voucher",
          category: "gift_cards",
          unitPrice: 20.0,
          qty: 1,
          merchant: "demo-store",
        },
      ],
      total: 20.0,
    });
    const res = decide(makeInput({ cart }));
    expect(res.decision).toBe("block");
    expect(res.reasons).toContain(
      "category gift_cards not allowed (Digital Voucher)"
    );
  });

  it("blocks blocked keywords (case-insensitive)", () => {
    const cart = makeCart({
      items: [
        {
          sku: "book-1",
          name: "How to buy Bitcoin online",
          category: "school",
          unitPrice: 15.0,
          qty: 1,
          merchant: "demo-store",
        },
      ],
      total: 15.0,
    });
    const res = decide(makeInput({ cart }));
    expect(res.decision).toBe("block");
    expect(res.reasons).toContain(
      'blocked keyword "bitcoin" (How to buy Bitcoin online)'
    );
  });

  it("blocks when cart total does not match item sum within 1 cent", () => {
    const cart = makeCart({
      items: [
        {
          sku: "apple-1",
          name: "Apples",
          category: "groceries",
          unitPrice: 5.0,
          qty: 2, // 10.0
          merchant: "demo-store",
        },
      ],
      total: 12.0, // mismatch
    });
    const res = decide(makeInput({ cart }));
    expect(res.decision).toBe("block");
    expect(res.reasons).toContain("cart total does not match items");
  });

  it("blocks when total exceeds perTxCap", () => {
    const cart = makeCart({
      items: [
        {
          sku: "item-1",
          name: "Bulk Groceries",
          category: "groceries",
          unitPrice: 105.0,
          qty: 1,
          merchant: "demo-store",
        },
      ],
      total: 105.0,
    });
    const res = decide(makeInput({ cart }));
    expect(res.decision).toBe("block");
    expect(res.reasons).toContain(
      "total 105.00 exceeds per-purchase cap 100"
    );
  });

  it("blocks when prior spend + total exceeds monthlyCap", () => {
    // monthlyCap is 300, prior spend is 250, cart is 60 -> total 310 > 300
    const cart = makeCart({
      items: [
        {
          sku: "item-1",
          name: "Weekly Groceries",
          category: "groceries",
          unitPrice: 60.0,
          qty: 1,
          merchant: "demo-store",
        },
      ],
      total: 60.0,
    });
    const res = decide(
      makeInput({
        spentThisMonthCents: 25000,
        cart,
      })
    );
    expect(res.decision).toBe("block");
    expect(res.reasons).toContain(
      "would bring monthly spend to 310.00, above cap 300"
    );
  });

  it("blocks when risk score >= 0.7", () => {
    const highRisk: RiskReport = {
      riskScore: 0.85,
      signals: ["prompt injection detected"],
      verdict: "malicious",
    };
    const res = decide(makeInput({ risk: highRisk }));
    expect(res.decision).toBe("block");
    expect(res.reasons).toContain(
      "prompt injection or manipulation suspected (risk 0.85)"
    );
    expect(res.reasons).toContain("prompt injection detected");
  });

  it("needs_approval when risk is between reviewAt (0.4) and blockAt (0.7)", () => {
    const mediumRisk: RiskReport = {
      riskScore: 0.5,
      signals: ["unusual purchase pattern"],
      verdict: "suspicious",
    };
    const res = decide(makeInput({ risk: mediumRisk }));
    expect(res.decision).toBe("needs_approval");
    expect(res.reasons).toContain("unusual cart (risk 0.5)");
    expect(res.reasons).toContain("unusual purchase pattern");
  });

  it("fails closed to needs_approval when detector is unavailable (risk === null)", () => {
    const res = decide(makeInput({ risk: null }));
    expect(res.decision).toBe("needs_approval");
    expect(res.reasons).toEqual(["risk check unavailable"]);
  });

  it("needs_approval when total > approvalAbove", () => {
    const cart = makeCart({
      items: [
        {
          sku: "item-1",
          name: "Groceries",
          category: "groceries",
          unitPrice: 75.0,
          qty: 1,
          merchant: "demo-store",
        },
      ],
      total: 75.0,
    });
    const res = decide(makeInput({ cart }));
    expect(res.decision).toBe("needs_approval");
    expect(res.reasons).toContain(
      "total 75.00 is above your ask-me amount 60"
    );
  });

  it("returns multiple reasons together when multiple rules are triggered", () => {
    const cart: Cart = {
      items: [
        {
          sku: "bad-1",
          name: "Free Gift Card",
          category: "crypto",
          unitPrice: 75.0,
          qty: 1,
          merchant: "dem0-store",
        },
        {
          sku: "bad-2",
          name: "Bitcoin Miner",
          category: "crypto",
          unitPrice: 75.0,
          qty: 1,
          merchant: "dem0-store",
        },
      ],
      total: 150.0,
      agentReasoning: "Multiple bad items",
      sourceUrls: [],
    };
    const res = decide(
      makeInput({
        mandate: { rules: baseRules, status: "active", signatureValid: false },
        cart,
        risk: { riskScore: 0.9, signals: ["injection"], verdict: "malicious" },
      })
    );
    expect(res.decision).toBe("block");
    expect(res.reasons).toContain("mandate signature is invalid");
    expect(res.reasons).toContain("category crypto not allowed (Free Gift Card)");
    expect(res.reasons).toContain("merchant dem0-store not allowed (Free Gift Card)");
    expect(res.reasons).toContain('blocked keyword "gift card" (Free Gift Card)');
    expect(res.reasons).toContain('blocked keyword "bitcoin" (Bitcoin Miner)');
    expect(res.reasons).toContain("total 150.00 exceeds per-purchase cap 100");
    expect(res.reasons).toContain("prompt injection or manipulation suspected (risk 0.9)");
    expect(res.reasons).toContain("injection");
  });
});
