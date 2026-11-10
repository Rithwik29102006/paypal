import { config } from "../config.js";
import { defaultMockPayPal, MockPayPal } from "./mock.js";
import { SandboxPayPal, PayPalApiError } from "./sandbox.js";
import type { PayPalClient } from "./types.js";

export * from "./types.js";
export * from "./mock.js";
export * from "./sandbox.js";

export function getPayPalClient(
  mode: "mock" | "sandbox" = config.PAYPAL_MODE
): PayPalClient {
  if (mode === "sandbox") {
    return new SandboxPayPal();
  }
  return defaultMockPayPal;
}
