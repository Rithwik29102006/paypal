import { z } from "zod";
import { config } from "../config.js";
import type {
  PayPalClient,
  CreateSetupTokenInput,
  CreateSetupTokenOutput,
  CreateOrderInput,
  CreateOrderOutput,
  CaptureOrderOutput,
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

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    if (method === "POST") {
      headers["PayPal-Request-Id"] = requestId;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    try {
      const res = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
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
          // VERIFY: experience_context usage_type for Vault v3 setup-tokens
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
    const totalFormatted = (input.totalCents / 100).toFixed(2);
    const itemTotalCents = input.items.reduce(
      (sum, item) => sum + Math.round(item.unitPrice * 100) * item.qty,
      0
    );
    const itemTotalFormatted = (itemTotalCents / 100).toFixed(2);

    if (totalFormatted !== itemTotalFormatted) {
      throw new Error(
        `item_total must equal the sum of unit_amount*quantity: ${totalFormatted} !== ${itemTotalFormatted}`
      );
    }

    // Orders v2 payload
    const purchaseUnit = {
      amount: {
        currency_code: "USD",
        value: totalFormatted,
        breakdown: {
          item_total: {
            currency_code: "USD",
            value: itemTotalFormatted,
          },
        },
      },
      items: input.items.map((i) => ({
        name: i.name,
        unit_amount: {
          currency_code: "USD",
          value: i.unitPrice.toFixed(2),
        },
        quantity: String(i.qty),
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

    return {
      orderId: parsed.id,
      status: parsed.status,
      approveUrl: approveLink?.href,
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
}
