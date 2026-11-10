import { describe, it, expect, vi } from "vitest";
import { SandboxPayPal, PayPalApiError } from "../src/paypal/sandbox.js";

describe("SandboxPayPal client", () => {
  it("OAuth token is cached and reused across calls", async () => {
    let oauthCallCount = 0;

    const fakeFetch: typeof fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/oauth2/token")) {
        oauthCallCount++;
        return new Response(
          JSON.stringify({
            access_token: "fake_access_token_123",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (urlStr.includes("/v3/vault/setup-tokens")) {
        return new Response(
          JSON.stringify({
            id: "fake_setup_token",
            links: [{ href: "https://sandbox.paypal.com/approve", rel: "approve" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response("Not found", { status: 404 });
    }) as any;

    const client = new SandboxPayPal(fakeFetch);

    // Call 1
    const res1 = await client.createSetupToken({
      returnUrl: "http://localhost:3000/return",
      cancelUrl: "http://localhost:3000/cancel",
      requestId: "req-1",
    });
    expect(res1.setupTokenId).toBe("fake_setup_token");
    expect(oauthCallCount).toBe(1);

    // Call 2 - should reuse cached token
    const res2 = await client.createSetupToken({
      returnUrl: "http://localhost:3000/return",
      cancelUrl: "http://localhost:3000/cancel",
      requestId: "req-2",
    });
    expect(res2.setupTokenId).toBe("fake_setup_token");
    expect(oauthCallCount).toBe(1);
  });

  it("401 error triggers token refresh once and retries request", async () => {
    let oauthCallCount = 0;
    let paymentTokenAttempts = 0;

    const fakeFetch: typeof fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/oauth2/token")) {
        oauthCallCount++;
        return new Response(
          JSON.stringify({
            access_token: `token_attempt_${oauthCallCount}`,
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (urlStr.includes("/v3/vault/payment-tokens")) {
        paymentTokenAttempts++;
        if (paymentTokenAttempts === 1) {
          // Return 401 on first attempt
          return new Response(
            JSON.stringify({ message: "Invalid or expired token" }),
            { status: 401, headers: { "paypal-debug-id": "dbg_401" } }
          );
        }
        // Succeed on second attempt
        return new Response(
          JSON.stringify({ id: "vault_success_123" }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response("Not found", { status: 404 });
    }) as any;

    const client = new SandboxPayPal(fakeFetch);
    const result = await client.createPaymentToken("setup_tok_1", "req-vault-1");

    expect(result.vaultId).toBe("vault_success_123");
    expect(oauthCallCount).toBe(2);
    expect(paymentTokenAttempts).toBe(2);
  });

  it("PayPal-Request-Id header is sent on every POST request", async () => {
    let capturedHeaders: Record<string, string> = {};

    const fakeFetch: typeof fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({
            access_token: "token_abc",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (urlStr.includes("/v2/checkout/orders")) {
        const headers = init?.headers as Record<string, string>;
        capturedHeaders = { ...headers };
        return new Response(
          JSON.stringify({
            id: "ORDER-789",
            status: "CREATED",
            links: [{ rel: "payer-action", href: "https://paypal.com/checkout" }],
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response("Not found", { status: 404 });
    }) as any;

    const client = new SandboxPayPal(fakeFetch);
    await client.createOrder({
      items: [{ name: "Apples", unitPrice: 3, qty: 1 }],
      totalCents: 300,
      requestId: "custom-req-id-999",
      returnUrl: "http://localhost:3000/return",
      cancelUrl: "http://localhost:3000/cancel",
    });

    expect(capturedHeaders["PayPal-Request-Id"]).toBe("custom-req-id-999");
  });

  it("error message includes debug_id and HTTP status, never headers/secrets", async () => {
    const fakeFetch: typeof fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({
            access_token: "super_secret_access_token",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (urlStr.includes("/v2/checkout/orders")) {
        return new Response(
          JSON.stringify({
            name: "UNPROCESSABLE_ENTITY",
            message: "The requested transaction cannot be processed",
            debug_id: "dbg_err_xyz_777",
          }),
          {
            status: 422,
            headers: {
              "Content-Type": "application/json",
              "paypal-debug-id": "dbg_err_xyz_777",
            },
          }
        );
      }

      return new Response("Not found", { status: 404 });
    }) as any;

    const client = new SandboxPayPal(fakeFetch);

    await expect(
      client.createOrder({
        items: [{ name: "Apples", unitPrice: 3, qty: 1 }],
        totalCents: 300,
        requestId: "req-err-test",
      })
    ).rejects.toThrowError(PayPalApiError);

    try {
      await client.createOrder({
        items: [{ name: "Apples", unitPrice: 3, qty: 1 }],
        totalCents: 300,
        requestId: "req-err-test-2",
      });
    } catch (err: any) {
      expect(err).toBeInstanceOf(PayPalApiError);
      expect(err.statusCode).toBe(422);
      expect(err.debugId).toBe("dbg_err_xyz_777");
      expect(err.message).toContain("422");
      expect(err.message).toContain("dbg_err_xyz_777");
      expect(err.message).toContain("The requested transaction cannot be processed");
      // Never expose secrets
      expect(err.message).not.toContain("super_secret_access_token");
      expect(err.message).not.toContain("Authorization");
      expect(err.message).not.toContain("Basic");
    }
  });
});
