/**
 * Everything that happens when the agent wants to spend money, with no LLM
 * involved. The agent's request_payment tool is a thin wrapper around
 * requestPayment(), which makes this logic easy to test and red-team.
 *
 * Safety properties enforced here (not by the prompt):
 *  - Prices come from the catalog, never from the model.
 *  - Every page the agent read is attached as evidence; the model can't omit it.
 *  - Money moves only through /check then /pay.
 *  - After a block, carts containing the blocked items are refused locally,
 *    so the agent can't split a blocked cart into smaller pieces.
 */
import type { Cart, CartItem, LiveEvent } from "@mandate/shared";
import { config } from "./config.js";
import type { MandateClient } from "./mandateClient.js";
import { getProduct, mentionsSku, pageText as storePageText, pageUrl } from "./store.js";

export interface PaymentOutcome {
  status: "paid" | "awaiting_buyer_approval" | "blocked" | "rejected_by_user" | "approval_timeout" | "refused_locally" | "error";
  message: string;
  /** PayPal link the buyer must open when no saved payment method exists yet. */
  approveUrl?: string;
  cartId?: string;
  reasons?: string[];
  riskScore?: number;
  paypalOrderId?: string;
  total?: number;
}

export class AgentSession {
  readonly pagesRead = new Map<string, string>();
  readonly blockedSkus = new Set<string>();
  readonly events: LiveEvent[] = [];

  constructor(
    readonly userRequest: string,
    readonly client: MandateClient,
    readonly mandateId: string = config.mandateId,
    private onEvent: (e: LiveEvent) => void = () => {},
  ) {}

  emit(e: Omit<LiveEvent, "at">) {
    const ev: LiveEvent = { ...e, at: new Date().toISOString() };
    this.events.push(ev);
    this.onEvent(ev);
  }

  recordPage(sku: string, text: string) {
    this.pagesRead.set(sku, text);
  }

  buildCart(lines: Array<{ sku: string; qty: number }>, reasoning: string): Cart {
    const items: CartItem[] = lines.map(({ sku, qty }) => {
      const p = getProduct(sku);
      if (!p) throw new Error(`unknown sku ${sku}`);
      return { sku: p.sku, name: p.name, category: p.category, unitPrice: p.price, qty, merchant: p.merchant };
    });
    const total = Math.round(items.reduce((s, i) => s + i.unitPrice * i.qty, 0) * 100) / 100;
    return { items, total, agentReasoning: reasoning, sourceUrls: lines.map((l) => pageUrl(l.sku)) };
  }

  async requestPayment(lines: Array<{ sku: string; qty: number }>, reasoning: string): Promise<PaymentOutcome> {
    let cart: Cart;
    try {
      cart = this.buildCart(lines, reasoning);
    } catch (err) {
      return { status: "error", message: (err as Error).message };
    }

    const retried = cart.items.filter((i) => this.blockedSkus.has(i.sku));
    if (retried.length > 0) {
      const message = `Refused: ${retried.map((i) => i.name).join(", ")} was already blocked. Do not retry it in another cart.`;
      this.emit({ type: "agent", summary: message });
      return { status: "refused_locally", message };
    }

    // Evidence = the store page of every item being bought (even if the agent
    // never opened it: Mandate inspects what the merchant shows, not just what
    // the model chose to read), plus any page the agent read that names one of
    // them (that is how an injection pushes extra items into a cart).
    const skus = cart.items.map((i) => i.sku);
    const pages = new Map(
      [...this.pagesRead.entries()].filter(([sku, text]) => skus.includes(sku) || skus.some((s) => mentionsSku(text, s)))
    );
    for (const sku of skus) {
      if (!pages.has(sku)) {
        const product = getProduct(sku);
        if (product) pages.set(sku, storePageText(product));
      }
    }
    const pageText = [...pages.values()].join("\n\n---\n\n");
    this.emit({ type: "agent", summary: `Asking Mandate to check ${cart.items.length} item(s), $${cart.total.toFixed(2)}` });

    const check = await this.client.check({ mandateId: this.mandateId, cart, pageText, userRequest: this.userRequest });
    this.emit({ type: "check", cartId: check.cartId, decision: check.decision, summary: `${check.decision}: ${check.reasons[0] ?? ""}` });

    if (check.decision === "block") {
      cart.items.forEach((i) => this.blockedSkus.add(i.sku));
      return {
        status: "blocked",
        cartId: check.cartId,
        reasons: check.reasons,
        riskScore: check.riskScore,
        total: cart.total,
        message: "Mandate blocked this purchase. Tell the user why and do not try to buy these items again.",
      };
    }

    if (check.decision === "needs_approval") {
      if (!check.approvalId) return { status: "error", message: "needs_approval without approvalId" };
      this.emit({ type: "approval", cartId: check.cartId, summary: `Waiting for the user to approve $${cart.total.toFixed(2)}` });
      const outcome = await this.client.waitForApproval(check.approvalId, config.approvalTimeoutMs);
      this.emit({ type: "approval", cartId: check.cartId, summary: `User ${outcome}` });
      if (outcome === "rejected") {
        cart.items.forEach((i) => this.blockedSkus.add(i.sku));
        return { status: "rejected_by_user", cartId: check.cartId, reasons: check.reasons, message: "The user rejected this purchase." };
      }
      if (outcome === "timeout") {
        return { status: "approval_timeout", cartId: check.cartId, message: "The user did not answer in time. Nothing was bought." };
      }
    }

    try {
      const pay = await this.client.pay(check.cartId);

      // Only "captured" means money moved. Without a saved PayPal payment
      // method, the API creates the order and returns a link the buyer must
      // approve first (fallback path); a "failed" payment is an error.
      if (pay.status === "captured") {
        this.emit({ type: "payment", cartId: check.cartId, summary: `Paid $${cart.total.toFixed(2)} via PayPal (order ${pay.paypalOrderId})` });
        return {
          status: "paid",
          cartId: check.cartId,
          paypalOrderId: pay.paypalOrderId,
          total: cart.total,
          message: `Paid $${cart.total.toFixed(2)} through PayPal.`,
        };
      }
      if (pay.status === "created") {
        this.emit({ type: "payment", cartId: check.cartId, summary: `PayPal order ${pay.paypalOrderId} created for $${cart.total.toFixed(2)}; waiting for the buyer to approve it in PayPal` });
        this.emit({
          type: "agent",
          cartId: check.cartId,
          summary: `Approve the $${cart.total.toFixed(2)} PayPal order to finish this purchase (no saved PayPal account yet)`,
          approveUrl: pay.approveUrl,
        });
        return {
          status: "awaiting_buyer_approval",
          cartId: check.cartId,
          paypalOrderId: pay.paypalOrderId,
          approveUrl: pay.approveUrl,
          total: cart.total,
          message: "Mandate allowed this purchase, but nothing is paid yet: the user must approve the PayPal order (no saved payment method). Tell the user.",
        };
      }
      return { status: "error", cartId: check.cartId, paypalOrderId: pay.paypalOrderId, message: `PayPal payment ${pay.status}; nothing was charged.` };
    } catch (err) {
      return { status: "error", cartId: check.cartId, message: (err as Error).message };
    }
  }
}
