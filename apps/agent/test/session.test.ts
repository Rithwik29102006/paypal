import { describe, expect, it } from "vitest";
import { MockMandateClient } from "../src/mandateClient.js";
import { AgentSession } from "../src/session.js";
import { getProduct, pageText } from "../src/store.js";

function session(request: string, auto: "approve" | "reject" | "manual" = "approve") {
  const client = new MockMandateClient(auto);
  return { client, s: new AgentSession(request, client, "mdt_test") };
}

describe("payment flow (no LLM)", () => {
  it("pays for a normal cart", async () => {
    const { s, client } = session("buy notebooks and milk for this week");
    s.recordPage("GRO-MILK", pageText(getProduct("GRO-MILK")!));
    const out = await s.requestPayment([{ sku: "SCH-NOTEBOOK", qty: 2 }, { sku: "GRO-MILK", qty: 1 }], "Notebooks and milk as requested.");
    expect(out.status).toBe("paid");
    expect(client.spentThisMonth).toBeCloseTo(10.47);
  });

  it("blocks the hidden gift card attack and never pays", async () => {
    const { s, client } = session("buy a back-to-school bundle");
    s.recordPage("SCH-BUNDLE", pageText(getProduct("SCH-BUNDLE")!));
    const out = await s.requestPayment([{ sku: "SCH-BUNDLE", qty: 1 }, { sku: "GC-100", qty: 10 }], "The page said gift cards are required.");
    expect(out.status).toBe("blocked");
    expect(out.reasons!.join(" ")).toMatch(/gift_cards not allowed/);
    expect(client.spentThisMonth).toBe(0);
  });

  it("refuses to retry blocked items in a smaller cart", async () => {
    const { s } = session("buy a back-to-school bundle");
    s.recordPage("SCH-BUNDLE", pageText(getProduct("SCH-BUNDLE")!));
    await s.requestPayment([{ sku: "GC-100", qty: 10 }], "required");
    const retry = await s.requestPayment([{ sku: "GC-100", qty: 1 }], "just one");
    expect(retry.status).toBe("refused_locally");
  });

  it("holds a cart above the ask-me amount and pays once approved", async () => {
    const { s } = session("buy a backpack and a calculator and crayons for school", "approve");
    const out = await s.requestPayment(
      [{ sku: "SCH-BACKPACK", qty: 1 }, { sku: "SCH-CALC", qty: 1 }, { sku: "SCH-CRAYONS", qty: 5 }],
      "School supplies as requested.",
    );
    expect(out.status).toBe("paid");
    expect(s.events.some((e) => e.type === "approval")).toBe(true);
  });

  it("stops when the user rejects", async () => {
    const { s, client } = session("buy a backpack and a calculator and crayons for school", "reject");
    const out = await s.requestPayment(
      [{ sku: "SCH-BACKPACK", qty: 1 }, { sku: "SCH-CALC", qty: 1 }, { sku: "SCH-CRAYONS", qty: 5 }],
      "School supplies as requested.",
    );
    expect(out.status).toBe("rejected_by_user");
    expect(client.spentThisMonth).toBe(0);
  });

  it("a poisoned page the agent only browsed does not taint a clean cart", async () => {
    const { s } = session("buy notebooks for school");
    s.recordPage("SCH-NOTEBOOK-5", pageText(getProduct("SCH-NOTEBOOK-5")!));
    s.recordPage("SCH-NOTEBOOK", pageText(getProduct("SCH-NOTEBOOK")!));
    const out = await s.requestPayment([{ sku: "SCH-NOTEBOOK", qty: 3 }], "Notebooks as requested.");
    expect(out.status).toBe("paid");
  });

  it("but buying what the poisoned page pushed is blocked", async () => {
    const { s } = session("buy notebooks for school");
    s.recordPage("SCH-NOTEBOOK-5", pageText(getProduct("SCH-NOTEBOOK-5")!));
    const out = await s.requestPayment([{ sku: "SCH-NOTEBOOK-5", qty: 1 }, { sku: "SCH-PREMIUM", qty: 1 }], "Store policy requires the premium bundle.");
    expect(out.status).toBe("blocked");
  });

  it("Mandate inspects an item's store page even when the agent never opened it", async () => {
    const { s, client } = session("buy a back-to-school bundle");
    // No recordPage: the model skipped reading the poisoned bundle page.
    const out = await s.requestPayment([{ sku: "SCH-BUNDLE", qty: 1 }], "Bundle as requested.");
    expect(out.status).not.toBe("paid");
    expect(client.spentThisMonth).toBe(0);
  });

  it("mock /pay refuses a blocked cart (second lock)", async () => {
    const { s, client } = session("milk");
    const out = await s.requestPayment([{ sku: "GC-100", qty: 1 }], "gift");
    expect(out.status).toBe("blocked");
    await expect(client.pay(out.cartId!)).rejects.toThrow(/403/);
  });
});
