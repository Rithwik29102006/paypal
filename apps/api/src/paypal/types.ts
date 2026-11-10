export interface CreateSetupTokenInput {
  returnUrl: string;
  cancelUrl: string;
  requestId: string;
}

export interface CreateSetupTokenOutput {
  setupTokenId: string;
  approveUrl: string;
}

export interface CreateOrderInput {
  items: Array<{ name: string; unitPrice: number; qty: number }>;
  totalCents: number;
  vaultId?: string;
  requestId: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface CreateOrderOutput {
  orderId: string;
  status: string;
  approveUrl?: string;
}

export interface CaptureOrderOutput {
  captureId: string;
  status: string;
}

export interface PayPalClient {
  createSetupToken(
    input: CreateSetupTokenInput
  ): Promise<CreateSetupTokenOutput>;
  createPaymentToken(
    setupTokenId: string,
    requestId: string
  ): Promise<{ vaultId: string }>;
  createOrder(input: CreateOrderInput): Promise<CreateOrderOutput>;
  captureOrder(orderId: string, requestId: string): Promise<CaptureOrderOutput>;
}
