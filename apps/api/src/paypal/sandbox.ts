import { z } from "zod";
import { config } from "../config.js";
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

export class PayPalApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public debugId?: string
  ) {
    super(
      debugId
        ? `[PayPal API ${statusCode}] ${message} (debug_id: ${debugId})`
        : `[PayPal API ${statusCode}] ${message}`
    );
    this.name = "PayPalApiError";
  }
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const TokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
});

const SetupTokenResponseSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  links: z
    .array(
      z.object({
        href: z.string(),
        rel: z.string(),
      })
    )
    .optional(),
});

const PaymentTokenResponseSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
});

const CreateOrderResponseSchema = z.object({
  id: z.string(),
  status: z.string(),
  links: z
    .array(
      z.object({
        href: z.string(),
        rel: z.string(),
      })
    )
    .optional(),
  purchase_units: z
    .array(
      z.object({
        payments: z
          .object({
            captures: z
              .array(
                z.object({
                  id: z.string(),
                  status: z.string().optional(),
                })
              )
              .optional(),
          })
          .optional(),
      })
    )
    .optional(),
});

const CaptureOrderResponseSchema = z.object({
  id: z.string(),
  status: z.string(),
  purchase_units: z
    .array(
      z.object({
        payments: z
          .object({
            captures: z
              .array(
                z.object({
                  id: z.string(),
                  status: z.string(),
                })
              )
              .min(1),
          })
          .optional(),
      })
    )
    .min(1),
});

const VerifyWebhookResponseSchema = z.object({
  verification_status: z.string(),
});

const DisputeResponseSchema = z.object({
  dispute_id: z.string().optional(),
  id: z.string().optional(),
  status: z.string(),
  reason: z.string().optional(),
  dispute_amount: z
    .object({
      value: z.string(),
      currency_code: z.string(),
    })
    .optional(),
  create_time: z.string().optional(),
});

export class SandboxPayPal implements PayPalClient {
  private baseUrl = "https://api-m.sandbox.paypal.com";
  private tokenCache: CachedToken | null = null;

  constructor(private fetchFn: typeof fetch = fetch) {}

  public async getAccessToken(
    forceRefresh = false
  ): Promise<{ accessToken: string; expiresIn: number }> {
    if (
      !forceRefresh &&
      this.tokenCache &&
      Date.now() < this.tokenCache.expiresAt - 60_000
    ) {
      const remainingSeconds = Math.max(
        0,
        Math.floor((this.tokenCache.expiresAt - Date.now()) / 1000)
      );
      return {
        accessToken: this.tokenCache.accessToken,
        expiresIn: remainingSeconds,
      };
    }

    const clientId = config.PAYPAL_CLIENT_ID ?? "";
    const clientSecret = config.PAYPAL_CLIENT_SECRET ?? "";
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    try {
      const res = await this.fetchFn(`${this.baseUrl}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let debugId = res.headers.get("paypal-debug-id") || undefined;
        let message = `OAuth failed with status ${res.status}`;
        try {
          const parsed = JSON.parse(text);
          if (parsed.error_description) message = parsed.error_description;
          if (parsed.debug_id) debugId = parsed.debug_id;
        } catch {
          // Keep default message
        }
        throw new PayPalApiError(message, res.status, debugId);
      }

      const json = await res.json();
      const parsed = TokenResponseSchema.parse(json);

      this.tokenCache = {
        accessToken: parsed.access_token,
        expiresAt: Date.now() + parsed.expires_in * 1000,
      };

      return {
        accessToken: this.tokenCache.accessToken,
        expiresIn: parsed.expires_in,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST",
    body: unknown,
    requestId: string,
    isRetry = false
  ): Promise<T> {
    const { accessToken: token } = await this.getAccessToken();

    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    // For multipart bodies fetch sets Content-Type (with the boundary) itself.
    if (!isForm) headers["Content-Type"] = "application/json";

    if (method === "POST") {
      headers["PayPal-Request-Id"] = requestId;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    try {
      const res = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: isForm ? (body as FormData) : body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (res.status === 401 && !isRetry) {
        // Refresh token once on 401
        await this.getAccessToken(true);
        return await this.request<T>(path, method, body, requestId, true);
      }

      const text = await res.text().catch(() => "");
      let debugId = res.headers.get("paypal-debug-id") || undefined;
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = {};
      }

      if (!res.ok) {
        let message = `Request to ${path} failed with HTTP ${res.status}`;
        if (json && typeof json === "object") {
          const obj = json as Record<string, unknown>;
          if (typeof obj.message === "string") message = obj.message;
          if (typeof obj.debug_id === "string") debugId = obj.debug_id;
        }
        throw new PayPalApiError(message, res.status, debugId);
      }

      return json as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async createSetupToken(
    input: CreateSetupTokenInput
  ): Promise<CreateSetupTokenOutput> {
    // Official PayPal Vault v3 setup-tokens endpoint
    const body = {
      payment_source: {
        paypal: {
          // Vault v3: usage_type belongs directly under payment_source.paypal, not experience_context
          // VERIFY: Vault v3 usage_type ("MERCHANT" vs "PLATFORM") depending on seller account configuration
          usage_type: "MERCHANT",
          experience_context: {
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    };

    const data = await this.request<unknown>(
      "/v3/vault/setup-tokens",
      "POST",
      body,
      input.requestId
    );

    const parsed = SetupTokenResponseSchema.parse(data);
    const approveLink = parsed.links?.find(
      (l) => l.rel === "approve" || l.rel === "payer-action"
    );

    if (!approveLink) {
      // VERIFY: Approval URL link rel in setup-tokens response
      throw new PayPalApiError(
        "Missing approval URL in PayPal setup token response",
        502
      );
    }

    return {
      setupTokenId: parsed.id,
      approveUrl: approveLink.href,
    };
  }

  async createPaymentToken(
    setupTokenId: string,
    requestId: string
  ): Promise<{ vaultId: string }> {
    // Official PayPal Vault v3 payment-tokens endpoint
    const body = {
      payment_source: {
        token: {
          id: setupTokenId,
          type: "SETUP_TOKEN",
        },
      },
    };

    const data = await this.request<unknown>(
      "/v3/vault/payment-tokens",
      "POST",
      body,
      requestId
    );

    const parsed = PaymentTokenResponseSchema.parse(data);
    return {
      vaultId: parsed.id,
    };
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderOutput> {
    // Format money strings to 2 decimal places USD
    const totalAmount = (input.totalCents / 100).toFixed(2);
    const itemTotal = input.items
      .reduce((sum, it) => sum + it.unitPrice * it.qty, 0)
      .toFixed(2);

    const purchaseUnit = {
      amount: {
        currency_code: "USD",
        value: totalAmount,
        breakdown: {
          item_total: {
            currency_code: "USD",
            value: itemTotal,
          },
        },
      },
      items: input.items.map((it) => ({
        name: it.name,
        unit_amount: {
          currency_code: "USD",
          value: it.unitPrice.toFixed(2),
        },
        quantity: it.qty.toString(),
      })),
    };

    let paymentSource: Record<string, unknown>;

    if (input.vaultId) {
      // Vault path: buyer paying via vaulted token
      paymentSource = {
        paypal: {
          // VERIFY: payment_source.paypal.vault_id in Orders v2
          vault_id: input.vaultId,
        },
      };
    } else {
      // Fallback path: buyer approvals required
      paymentSource = {
        paypal: {
          // VERIFY: payment_source.paypal.experience_context in Orders v2 fallback
          experience_context: {
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      };
    }

    const body = {
      intent: "CAPTURE",
      purchase_units: [purchaseUnit],
      payment_source: paymentSource,
    };

    const data = await this.request<unknown>(
      "/v2/checkout/orders",
      "POST",
      body,
      input.requestId
    );

    const parsed = CreateOrderResponseSchema.parse(data);
    // VERIFY: Orders v2 payer-action or approve link rel
    const approveLink = parsed.links?.find(
      (l) => l.rel === "payer-action" || l.rel === "approve"
    );

    // If order was created with vault_id and intent CAPTURE, PayPal executes capture immediately and status is COMPLETED
    const capture = parsed.purchase_units?.[0]?.payments?.captures?.[0];

    return {
      orderId: parsed.id,
      status: parsed.status,
      approveUrl: approveLink?.href,
      captureId: capture?.id,
    };
  }

  async captureOrder(
    orderId: string,
    requestId: string
  ): Promise<CaptureOrderOutput> {
    const data = await this.request<unknown>(
      `/v2/checkout/orders/${orderId}/capture`,
      "POST",
      {},
      requestId
    );

    const parsed = CaptureOrderResponseSchema.parse(data);
    const capture = parsed.purchase_units[0].payments?.captures[0];

    if (!capture) {
      // VERIFY: captures array location in capture response
      throw new PayPalApiError(
        "Capture response missing capture payment details",
        502
      );
    }

    return {
      captureId: capture.id,
      status: parsed.status,
    };
  }

  async verifyWebhook(input: VerifyWebhookInput): Promise<boolean> {
    const getHeader = (name: string): string | undefined => {
      const target = name.toLowerCase();
      for (const [k, v] of Object.entries(input.headers)) {
        if (k.toLowerCase() === target) {
          return Array.isArray(v) ? v[0] : v;
        }
      }
      return undefined;
    };

    const transmissionId = getHeader("paypal-transmission-id");
    const transmissionTime = getHeader("paypal-transmission-time");
    const transmissionSig = getHeader("paypal-transmission-sig");
    const certUrl = getHeader("paypal-cert-url");
    const authAlgo = getHeader("paypal-auth-algo");

    if (
      !transmissionId ||
      !transmissionTime ||
      !transmissionSig ||
      !certUrl ||
      !authAlgo
    ) {
      return false;
    }

    let parsedEvent: unknown;
    try {
      parsedEvent = JSON.parse(input.rawBody);
    } catch {
      return false;
    }

    // VERIFY: POST /v1/notifications/verify-webhook-signature request body schema
    const body = {
      transmission_id: transmissionId,
      transmission_time: transmissionTime,
      transmission_sig: transmissionSig,
      cert_url: certUrl,
      auth_algo: authAlgo,
      webhook_id: config.PAYPAL_WEBHOOK_ID ?? "",
      webhook_event: parsedEvent,
    };

    const data = await this.request<unknown>(
      "/v1/notifications/verify-webhook-signature",
      "POST",
      body,
      transmissionId
    );

    const parsed = VerifyWebhookResponseSchema.parse(data);
    return parsed.verification_status === "SUCCESS";
  }

  async getDispute(disputeId: string): Promise<DisputeDetails> {
    // Official PayPal Disputes v1 endpoint
    // VERIFY: GET /v1/customer/disputes/{disputeId} response fields
    const data = await this.request<unknown>(
      `/v1/customer/disputes/${disputeId}`,
      "GET",
      null,
      disputeId
    );

    const parsed = DisputeResponseSchema.parse(data);
    const amountCents = parsed.dispute_amount
      ? Math.round(parseFloat(parsed.dispute_amount.value) * 100)
      : undefined;

    return {
      disputeId: parsed.dispute_id || parsed.id || disputeId,
      status: parsed.status,
      reason: parsed.reason,
      amountCents,
      currency: parsed.dispute_amount?.currency_code,
      createTime: parsed.create_time,
      raw: data,
    };
  }

  async provideEvidence(
    disputeId: string,
    input: ProvideEvidenceInput,
    requestId: string
  ): Promise<{ status: string }> {
    // Provide evidence accepts ONLY multipart/form-data: a JSON part named
    // "input" ({ evidences: [...] }) plus optional files in "evidence-file".
    // Source: developer.paypal.com/platforms/disputes/integrate-disputes and
    // the provide-evidence API reference. Sandbox test data asks for
    // evidence_type OTHER with notes (developer.paypal.com/disputes/test-go-live).
    const form = new FormData();
    form.append(
      "input",
      JSON.stringify({
        evidences: [
          {
            evidence_type: input.evidenceType || "OTHER",
            notes: input.notes.slice(0, 2000),
          },
        ],
      })
    );
    if (input.fileBuffer) {
      form.append(
        "evidence-file",
        new Blob([new Uint8Array(input.fileBuffer)], { type: "application/pdf" }),
        input.fileName || "mandate-evidence.pdf"
      );
    }

    await this.request<unknown>(
      `/v1/customer/disputes/${encodeURIComponent(disputeId)}/provide-evidence`,
      "POST",
      form,
      requestId
    );
    return { status: "SUCCESS" };
  }

  /**
   * SANDBOX ONLY. Moves a dispute from UNDER_REVIEW to WAITING_FOR_SELLER_RESPONSE
   * so the seller can provide evidence. Body: { action: "SELLER_EVIDENCE" }.
   */
  async requireEvidence(disputeId: string, requestId: string): Promise<void> {
    await this.request<unknown>(
      `/v1/customer/disputes/${encodeURIComponent(disputeId)}/require-evidence`,
      "POST",
      { action: "SELLER_EVIDENCE" },
      requestId
    );
  }

  /**
   * SANDBOX ONLY. Settles a dispute. The dispute must be UNDER_REVIEW and the
   * response must offer the adjudicate link. Body: { adjudication_outcome }.
   */
  async adjudicate(
    disputeId: string,
    outcome: "SELLER_FAVOR" | "BUYER_FAVOR",
    requestId: string
  ): Promise<void> {
    await this.request<unknown>(
      `/v1/customer/disputes/${encodeURIComponent(disputeId)}/adjudicate`,
      "POST",
      { adjudication_outcome: outcome },
      requestId
    );
  }
}
