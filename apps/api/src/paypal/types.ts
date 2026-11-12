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
  captureId?: string;
}

export interface CaptureOrderOutput {
  captureId: string;
  status: string;
}

export interface VerifyWebhookInput {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
}

export interface ProvideEvidenceInput {
  notes: string;
  evidenceType?: string;
  fileBuffer?: Buffer;
  fileName?: string;
}

export interface DisputeDetails {
  disputeId: string;
  status: string;
  reason?: string;
  amountCents?: number;
  currency?: string;
  createTime?: string;
  raw?: unknown;
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
  /** Refund a captured payment in full (Payments v2). */
  refundCapture(captureId: string, requestId: string): Promise<{ refundId: string; status: string }>;
  verifyWebhook(input: VerifyWebhookInput): Promise<boolean>;
  getDispute(disputeId: string): Promise<DisputeDetails>;
  provideEvidence(
    disputeId: string,
    input: ProvideEvidenceInput,
    requestId: string
  ): Promise<{ status: string }>;
  /** SANDBOX ONLY: move a dispute to WAITING_FOR_SELLER_RESPONSE. */
  requireEvidence(disputeId: string, requestId: string): Promise<void>;
  /** SANDBOX ONLY: settle a dispute in the seller's or buyer's favor. */
  adjudicate(
    disputeId: string,
    outcome: "SELLER_FAVOR" | "BUYER_FAVOR",
    requestId: string
  ): Promise<void>;
}
