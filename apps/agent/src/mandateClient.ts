/**
 * How the agent talks to the Mandate API. The agent never talks to PayPal.
 *
 *   HttpMandateClient  -> Member 2's apps/api (real PayPal sandbox)
 *   MockMandateClient  -> in-memory stand-in, so Member 1 can build and demo
 *                         before apps/api is ready (MOCK_API=1)
 */
import { randomUUID } from "node:crypto";
import {
  CheckResponse,
  PayResponse,
  type CheckRequest,
  type Rules,
} from "@mandate/shared";
import { config } from "./config.js";
import { detect } from "./detector.js";
import { DEMO_RULES, decide } from "./rulesEngine.js";

export type ApprovalOutcome = "approved" | "rejected" | "timeout";

export interface MandateClient {
  check(req: CheckRequest): Promise<CheckResponse>;
  pay(cartId: string): Promise<PayResponse>;
  waitForApproval(approvalId: string, timeoutMs: number): Promise<ApprovalOutcome>;
}

// ---------------------------------------------------------------------------
// Real API (Member 2)
// ---------------------------------------------------------------------------

export class HttpMandateClient implements MandateClient {
  constructor(private baseUrl = config.apiUrl) {}

  private async post(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${path} failed (${res.status}): ${JSON.stringify(json)}`);
    return json;
  }

  async check(req: CheckRequest) {
    return CheckResponse.parse(await this.post("/check", req));
  }

  async pay(cartId: string) {
    return PayResponse.parse(await this.post("/pay", { cartId }));
  }

  /**
   * Polls GET /approvals/:id until Anita decides.
   * NOTE for Member 2: please add GET /approvals/:id -> { status } to apps/api.
   */
  async waitForApproval(approvalId: string, timeoutMs: number): Promise<ApprovalOutcome> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await fetch(`${this.baseUrl}/approvals/${approvalId}`);
      if (res.ok) {
        const { status } = (await res.json()) as { status: string };
        if (status === "approved" || status === "rejected") return status;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    return "timeout";
  }
}

// ---------------------------------------------------------------------------
// Mock API (until apps/api is live)
// ---------------------------------------------------------------------------

interface MockCart {
  id: string;
  req: CheckRequest;
  decision: CheckResponse["decision"];
  approvalId?: string;
}

export class MockMandateClient implements MandateClient {
  rules: Rules = DEMO_RULES;
  spentThisMonth = 0;
  carts = new Map<string, MockCart>();
  approvals = new Map<string, "pending" | "approved" | "rejected">();
  log: string[] = [];

  /** "approve" | "reject" resolves held carts instantly (tests, red team). */
  constructor(private autoApprove: "approve" | "reject" | "manual" = "manual") {}

  async check(req: CheckRequest): Promise<CheckResponse> {
    const risk = await detect({ userRequest: req.userRequest ?? "", cart: req.cart, pageText: req.pageText });
    const { decision, reasons } = decide({ rules: this.rules, spentThisMonth: this.spentThisMonth, cart: req.cart, risk });
    const id = `cart_${randomUUID().slice(0, 8)}`;
    const cart: MockCart = { id, req, decision };
    if (decision === "needs_approval") {
      cart.approvalId = `apr_${randomUUID().slice(0, 8)}`;
      this.approvals.set(cart.approvalId, "pending");
      if (this.autoApprove !== "manual") this.resolve(cart.approvalId, this.autoApprove === "approve");
    }
    this.carts.set(id, cart);
    this.log.push(`check ${id}: ${decision} (${reasons.join("; ")})`);
    return { cartId: id, decision, reasons: [...reasons, ...risk.signals], riskScore: risk.riskScore, approvalId: cart.approvalId };
  }

  resolve(approvalId: string, approved: boolean) {
    if (!this.approvals.has(approvalId)) throw new Error(`unknown approval ${approvalId}`);
    this.approvals.set(approvalId, approved ? "approved" : "rejected");
  }

  async waitForApproval(approvalId: string, timeoutMs: number): Promise<ApprovalOutcome> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const s = this.approvals.get(approvalId);
      if (s === "approved" || s === "rejected") return s;
      await new Promise((r) => setTimeout(r, 300));
    }
    return "timeout";
  }

  async pay(cartId: string): Promise<PayResponse> {
    const cart = this.carts.get(cartId);
    if (!cart) throw new Error(`unknown cart ${cartId}`);
    const approved = cart.approvalId ? this.approvals.get(cart.approvalId) === "approved" : false;
    // Second lock, same as the real /pay: only allowed or approved carts.
    if (cart.decision !== "allow" && !approved) throw new Error(`403: cart ${cartId} is ${cart.decision}, payment refused`);
    this.spentThisMonth += cart.req.cart.total;
    this.log.push(`pay ${cartId}: ${cart.req.cart.total.toFixed(2)}`);
    return {
      paymentId: `pay_${randomUUID().slice(0, 8)}`,
      paypalOrderId: `MOCK-${randomUUID().slice(0, 12).toUpperCase()}`,
      captureId: `MOCKCAP-${randomUUID().slice(0, 8).toUpperCase()}`,
      status: "captured",
    };
  }
}

export function defaultClient(): MandateClient {
  return config.mockApi ? new MockMandateClient() : new HttpMandateClient();
}
