import type {
  PayPalClient,
  CreateSetupTokenInput,
  CreateSetupTokenOutput,
  CreateOrderInput,
  CreateOrderOutput,
  CaptureOrderOutput,
  VerifyWebhookInput,
  ProvideEvidenceInput,
  DisputeDetails,
} from "./types.js";

export class MockPayPal implements PayPalClient {
  public completeOnCreate = false;

  public callCounts = {
    createSetupToken: 0,
    createPaymentToken: 0,
    createOrder: 0,
    captureOrder: 0,
    refundCapture: 0,
    verifyWebhook: 0,
    getDispute: 0,
    provideEvidence: 0,
    requireEvidence: 0,
    adjudicate: 0,
  };

  public failures: {
    createSetupToken?: Error;
    createPaymentToken?: Error;
    createOrder?: Error;
    captureOrder?: Error;
    refundCapture?: Error;
    verifyWebhook?: Error;
    getDispute?: Error;
    provideEvidence?: Error;
    requireEvidence?: Error;
    adjudicate?: Error;
  } = {};

  public evidences = new Map<string, ProvideEvidenceInput>();
  public disputes = new Map<string, DisputeDetails>();

  reset() {
    this.completeOnCreate = false;
    this.callCounts = {
      createSetupToken: 0,
      createPaymentToken: 0,
      createOrder: 0,
      captureOrder: 0,
      refundCapture: 0,
      verifyWebhook: 0,
      getDispute: 0,
      provideEvidence: 0,
      requireEvidence: 0,
      adjudicate: 0,
    };
    this.failures = {};
    this.evidences.clear();
    this.disputes.clear();
  }

  async createSetupToken(
    input: CreateSetupTokenInput
  ): Promise<CreateSetupTokenOutput> {
    this.callCounts.createSetupToken++;
    if (this.failures.createSetupToken) {
      throw this.failures.createSetupToken;
    }
    const setupTokenId = `MOCK-SETUP-${this.callCounts.createSetupToken}`;
    const approveUrl = input.returnUrl;
    return {
      setupTokenId,
      approveUrl,
    };
  }

  async createPaymentToken(
    setupTokenId: string,
    _requestId: string
  ): Promise<{ vaultId: string }> {
    this.callCounts.createPaymentToken++;
    if (this.failures.createPaymentToken) {
      throw this.failures.createPaymentToken;
    }
    const vaultId = `MOCK-VAULT-${setupTokenId.replace("MOCK-SETUP-", "") || this.callCounts.createPaymentToken}`;
    return { vaultId };
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderOutput> {
    this.callCounts.createOrder++;
    if (this.failures.createOrder) {
      throw this.failures.createOrder;
    }
    const orderId = `MOCK-ORDER-${this.callCounts.createOrder}`;

    if (input.vaultId && this.completeOnCreate) {
      const captureId = `MOCK-CAP-${this.callCounts.createOrder}`;
      return {
        orderId,
        status: "COMPLETED",
        captureId,
      };
    }

    const status = input.vaultId ? "APPROVED" : "CREATED";
    const approveUrl = input.returnUrl
      ? input.returnUrl.includes("?")
        ? `${input.returnUrl}&orderId=${orderId}`
        : `${input.returnUrl}?orderId=${orderId}`
      : undefined;

    return {
      orderId,
      status,
      approveUrl,
    };
  }

  async captureOrder(
    orderId: string,
    _requestId: string
  ): Promise<CaptureOrderOutput> {
    this.callCounts.captureOrder++;
    if (this.failures.captureOrder) {
      throw this.failures.captureOrder;
    }
    const captureId = `MOCK-CAP-${orderId.replace("MOCK-ORDER-", "") || this.callCounts.captureOrder}`;
    return {
      captureId,
      status: "COMPLETED",
    };
  }

  async refundCapture(captureId: string, _requestId: string): Promise<{ refundId: string; status: string }> {
    this.callCounts.refundCapture++;
    if (this.failures.refundCapture) throw this.failures.refundCapture;
    return { refundId: `MOCK-REFUND-${captureId}`, status: "COMPLETED" };
  }

  async verifyWebhook(input: VerifyWebhookInput): Promise<boolean> {
    this.callCounts.verifyWebhook++;
    if (this.failures.verifyWebhook) {
      throw this.failures.verifyWebhook;
    }
    const hasMockHeader =
      Boolean(input.headers["x-mock-webhook"]) ||
      Boolean(input.headers["X-Mock-Webhook"]) ||
      Boolean(input.headers["x-mock-webhook".toLowerCase()]);

    if (hasMockHeader) {
      console.log("MOCK webhook accepted");
      return true;
    }
    return false;
  }

  async getDispute(disputeId: string): Promise<DisputeDetails> {
    this.callCounts.getDispute++;
    if (this.failures.getDispute) {
      throw this.failures.getDispute;
    }
    const existing = this.disputes.get(disputeId);
    if (existing) {
      return existing;
    }
    return {
      disputeId,
      status: "UNDER_REVIEW",
      reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
      amountCents: 1000,
      currency: "USD",
      createTime: new Date().toISOString(),
    };
  }

  async provideEvidence(
    disputeId: string,
    input: ProvideEvidenceInput,
    _requestId: string
  ): Promise<{ status: string }> {
    this.callCounts.provideEvidence++;
    if (this.failures.provideEvidence) {
      throw this.failures.provideEvidence;
    }
    this.evidences.set(disputeId, input);
    return { status: "SUCCESS" };
  }

  async requireEvidence(disputeId: string, _requestId: string): Promise<void> {
    this.callCounts.requireEvidence++;
    if (this.failures.requireEvidence) throw this.failures.requireEvidence;
    const d = await this.getDispute(disputeId);
    this.disputes.set(disputeId, { ...d, status: "WAITING_FOR_SELLER_RESPONSE" });
  }

  async adjudicate(
    disputeId: string,
    outcome: "SELLER_FAVOR" | "BUYER_FAVOR",
    _requestId: string
  ): Promise<void> {
    this.callCounts.adjudicate++;
    if (this.failures.adjudicate) throw this.failures.adjudicate;
    const d = await this.getDispute(disputeId);
    this.disputes.set(disputeId, {
      ...d,
      status: "RESOLVED",
      raw: { dispute_outcome: { outcome_code: outcome === "SELLER_FAVOR" ? "RESOLVED_SELLER_FAVOUR" : "RESOLVED_BUYER_FAVOUR" } },
    });
  }
}

export const defaultMockPayPal = new MockPayPal();
