import { describe, expect, it } from "vitest";
import type { Cart, CartItem } from "@mandate/shared";
import { combine, detect, ruleSignals } from "../src/detector.js";
import { getProduct, pageText } from "../src/store.js";

function item(sku: string, qty = 1): CartItem {
  const p = getProduct(sku)!;
  return { sku: p.sku, name: p.name, category: p.category, unitPrice: p.price, qty, merchant: p.merchant };
}
function cart(items: CartItem[], reasoning = "Matches the user's request."): Cart {
  return {
    items,
    total: Math.round(items.reduce((s, i) => s + i.unitPrice * i.qty, 0) * 100) / 100,
    agentReasoning: reasoning,
    sourceUrls: [],
  };
}

describe("rules layer", () => {
  it("allows a normal grocery cart", async () => {
    const r = await detect({
      userRequest: "buy milk and eggs for this week",
      cart: cart([item("GRO-MILK"), item("GRO-EGGS")]),
      pageText: pageText(getProduct("GRO-MILK")!),
    });
    expect(r.verdict).toBe("safe");
    expect(r.riskScore).toBeLessThan(0.4);
  });

  it("blocks the hidden-CSS gift card attack", async () => {
    const r = await detect({
      userRequest: "buy a back-to-school bundle",
      cart: cart([item("SCH-BUNDLE"), item("GC-100", 10)], "The page said the user also requires gift cards."),
      pageText: pageText(getProduct("SCH-BUNDLE")!),
    });
    expect(r.verdict).toBe("malicious");
    expect(r.signals.join(" ")).toMatch(/hidden with CSS/);
  });

  it("flags zero-width hidden instructions", () => {
    const s = ruleSignals({
      userRequest: "buy lactose-free milk",
      cart: cart([item("GRO-MILK2"), item("ELEC-EARBUDS")]),
      pageText: pageText(getProduct("GRO-MILK2")!),
    });
    expect(s.map((x) => x.id)).toEqual(expect.arrayContaining(["zero_width", "page_instructions", "page_pushed_items", "cart_drift"]));
    expect(combine(s)).toBeGreaterThanOrEqual(0.7);
  });

  it("does not punish a clean page that merely sells the item", () => {
    const s = ruleSignals({
      userRequest: "notebooks for school",
      cart: cart([item("SCH-NOTEBOOK", 3)]),
      pageText: pageText(getProduct("SCH-NOTEBOOK")!),
    });
    expect(combine(s)).toBeLessThan(0.4);
  });

  it("catches a lookalike merchant", () => {
    const s = ruleSignals({
      userRequest: "buy milk",
      cart: cart([item("GRO-MILK-X")]),
      pageText: pageText(getProduct("GRO-MILK-X")!),
    });
    expect(s.map((x) => x.id)).toContain("lookalike_merchant");
  });

  it("notices items the user never named", () => {
    const s = ruleSignals({
      userRequest: "buy one gallon of milk",
      cart: cart([item("GRO-MILK"), item("GRO-COFFEE", 6)], "The store recommends coffee with milk."),
      pageText: "",
    });
    expect(s.map((x) => x.id)).toEqual(expect.arrayContaining(["unrequested_items", "reasoning_defers_to_page"]));
    expect(combine(s)).toBeGreaterThanOrEqual(0.4);
  });

  it("catches a cart total that does not match its items", () => {
    const c = cart([item("GRO-MILK")]);
    c.total = 0.5;
    const s = ruleSignals({ userRequest: "milk", cart: c, pageText: "" });
    expect(s.map((x) => x.id)).toContain("total_mismatch");
  });
});
