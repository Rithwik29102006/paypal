import "dotenv/config";
import { z } from "zod";

const baseSchema = z.object({
  PORT: z
    .string()
    .default("4000")
    .transform((val) => {
      const n = parseInt(val, 10);
      if (isNaN(n)) throw new Error("PORT must be a valid number");
      return n;
    }),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DETECTOR_URL: z.string().default("http://localhost:4100"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  API_PUBLIC_URL: z.string().default("http://localhost:4000"),
  PAYPAL_MODE: z.enum(["mock", "sandbox"]).default("mock"),
  SIGNING_KEY: z.string().optional(),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  PAYPAL_RETURN_URL: z.string().optional(),
  PAYPAL_CANCEL_URL: z.string().optional(),
  RISK_BLOCK_AT: z
    .string()
    .default("0.7")
    .transform((val) => {
      const n = Number(val);
      if (isNaN(n)) throw new Error("RISK_BLOCK_AT must be a valid number");
      return n;
    }),
  RISK_REVIEW_AT: z
    .string()
    .default("0.4")
    .transform((val) => {
      const n = Number(val);
      if (isNaN(n)) throw new Error("RISK_REVIEW_AT must be a valid number");
      return n;
    }),
});

const envSchema = baseSchema
  .transform((data) => ({
    ...data,
    PAYPAL_RETURN_URL:
      data.PAYPAL_RETURN_URL && data.PAYPAL_RETURN_URL.length > 0
        ? data.PAYPAL_RETURN_URL
        : `${data.WEB_ORIGIN}/paypal/return`,
    PAYPAL_CANCEL_URL:
      data.PAYPAL_CANCEL_URL && data.PAYPAL_CANCEL_URL.length > 0
        ? data.PAYPAL_CANCEL_URL
        : `${data.WEB_ORIGIN}/paypal/cancel`,
  }))
  .superRefine((data, ctx) => {
    if (data.PAYPAL_MODE === "sandbox") {
      if (!data.PAYPAL_CLIENT_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "PAYPAL_CLIENT_ID is required when PAYPAL_MODE=sandbox",
          path: ["PAYPAL_CLIENT_ID"],
        });
      }
      if (!data.PAYPAL_CLIENT_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "PAYPAL_CLIENT_SECRET is required when PAYPAL_MODE=sandbox",
          path: ["PAYPAL_CLIENT_SECRET"],
        });
      }
      if (!data.PAYPAL_WEBHOOK_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "PAYPAL_WEBHOOK_ID is required when PAYPAL_MODE=sandbox",
          path: ["PAYPAL_WEBHOOK_ID"],
        });
      }
    }
  });

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "env"}: ${i.message}`)
      .join("\n");
    const msg = `[Mandate API] Missing or invalid environment variables:\n${missing}`;
    console.error(msg);
    throw new Error(msg);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = z.infer<typeof envSchema>;
