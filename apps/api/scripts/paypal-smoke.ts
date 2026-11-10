import { config } from "../src/config.js";
import { SandboxPayPal } from "../src/paypal/sandbox.js";

async function main() {
  if (
    config.PAYPAL_MODE !== "sandbox" ||
    !config.PAYPAL_CLIENT_ID ||
    !config.PAYPAL_CLIENT_SECRET ||
    !config.PAYPAL_WEBHOOK_ID
  ) {
    console.log(
      "PayPal sandbox smoke test skipped (mock mode or credentials not set)"
    );
    process.exit(0);
  }

  const client = new SandboxPayPal();
  const token = await client.getAccessToken();
  console.log(`PayPal OAuth OK, token expires in ${token.expiresIn}s`);
}

main().catch((err) => {
  console.error("PayPal smoke test failed:", err);
  process.exit(1);
});
