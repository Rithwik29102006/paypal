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
    verifyWebhook: 0,
    getDispute: 0,
    provideEvidence: 0,
  };

  public failures: {
    createSetupToken?: Error;
    createPaymentToken?: Error;
    createOrder?: Error;
    captureOrder?: Error;
    verifyWebhook?: Error;
    getDispute?: Error;
    provideEvidence?: Error;
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
      verifyWebhook: 0,
      getDispute: 0,
      provideEvidence: 0,
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
}

export const defaultMockPayPal = new MockPayPal();
