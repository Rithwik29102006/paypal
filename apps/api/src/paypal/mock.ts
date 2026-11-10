import type {
  PayPalClient,
  CreateSetupTokenInput,
  CreateSetupTokenOutput,
  CreateOrderInput,
  CreateOrderOutput,
  CaptureOrderOutput,
} from "./types.js";

export class MockPayPal implements PayPalClient {
  public callCounts = {
    createSetupToken: 0,
    createPaymentToken: 0,
    createOrder: 0,
    captureOrder: 0,
  };

  public failures: {
    createSetupToken?: Error;
    createPaymentToken?: Error;
    createOrder?: Error;
    captureOrder?: Error;
  } = {};

  reset() {
    this.callCounts = {
      createSetupToken: 0,
      createPaymentToken: 0,
      createOrder: 0,
      captureOrder: 0,
    };
    this.failures = {};
  }

  async createSetupToken(
    input: CreateSetupTokenInput
  ): Promise<CreateSetupTokenOutput> {
    this.callCounts.createSetupToken++;
    if (this.failures.createSetupToken) {
      throw this.failures.createSetupToken;
    }
    const setupTokenId = `MOCK-SETUP-${this.callCounts.createSetupToken}`;
    // In mock mode approveUrl returns the returnUrl
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
}

export const defaultMockPayPal = new MockPayPal();
