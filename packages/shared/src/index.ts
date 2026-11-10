/**
 * Shared contracts for Mandate. This file is the single source of truth for
 * every API body that crosses between apps/agent, apps/api and apps/web.
 *
 * Owner: Member 2. Announce any change in the team chat before merging.
 * Matches the "Shared contracts" section of the team build guide.
 */
import { z } from "zod";

// ---------- Rules and mandates ----------

export const Category = z.enum([
  "groceries",
  "school",
  "household",
  "electronics",
  "gift_cards",
  "crypto",
  "luxury",
]);
export type Category = z.infer<typeof Category>;

export const Rules = z.object({
  currency: z.literal("USD"),
  monthlyCap: z.number().positive(),
  perTxCap: z.number().positive(),
  approvalAbove: z.number().nonnegative(),
  allowedCategories: z.array(Category).min(1),
  allowedMerchants: z.array(z.string()).min(1),
  blockedKeywords: z.array(z.string()).default([]),
  expiresAt: z.string(), // ISO date-time
});
export type Rules = z.infer<typeof Rules>;

export const MandateStatus = z.enum(["active", "paused", "revoked"]);
export type MandateStatus = z.infer<typeof MandateStatus>;

export const Mandate = z.object({
  id: z.string(),
  userId: z.string(),
  rules: Rules,
  signature: z.string(),
  publicKey: z.string(),
  vaultId: z.string().nullable(),
  status: MandateStatus,
  createdAt: z.string(),
  spentThisMonth: z.number().nonnegative().optional(),
});
export type Mandate = z.infer<typeof Mandate>;

// ---------- Carts ----------

export const CartItem = z.object({
  sku: z.string(),
  name: z.string(),
  category: Category,
  unitPrice: z.number().nonnegative(),
  qty: z.number().int().positive(),
  merchant: z.string(),
});
export type CartItem = z.infer<typeof CartItem>;

export const Cart = z.object({
  items: z.array(CartItem).min(1),
  total: z.number().nonnegative(),
  agentReasoning: z.string(),
  sourceUrls: z.array(z.string()).default([]),
});
export type Cart = z.infer<typeof Cart>;

// ---------- Trick detector ----------

export const Verdict = z.enum(["safe", "suspicious", "malicious"]);
export type Verdict = z.infer<typeof Verdict>;

export const RiskReport = z.object({
  riskScore: z.number().min(0).max(1),
  signals: z.array(z.string()),
  verdict: Verdict,
  layers: z
    .object({
      rules: z.number().min(0).max(1),
      llm: z.number().min(0).max(1).nullable(),
    })
    .optional(),
});
export type RiskReport = z.infer<typeof RiskReport>;

// ---------- /check ----------

export const CheckRequest = z.object({
  mandateId: z.string(),
  cart: Cart,
  pageText: z.string().default(""),
  userRequest: z.string().optional(),
});
export type CheckRequest = z.infer<typeof CheckRequest>;

export const Decision = z.enum(["allow", "block", "needs_approval"]);
export type Decision = z.infer<typeof Decision>;

export const CheckResponse = z.object({
  cartId: z.string(),
  decision: Decision,
  reasons: z.array(z.string()),
  riskScore: z.number().min(0).max(1),
  receiptSeq: z.number().int().optional(),
  approvalId: z.string().optional(),
});
export type CheckResponse = z.infer<typeof CheckResponse>;

// ---------- /pay ----------

export const PayRequest = z.object({ cartId: z.string() });
export type PayRequest = z.infer<typeof PayRequest>;

export const PayResponse = z.object({
  paymentId: z.string(),
  paypalOrderId: z.string(),
  captureId: z.string().nullable(),
  status: z.enum(["created", "captured", "failed"]),
  receiptSeq: z.number().int().optional(),
  approveUrl: z.string().optional(),
});
export type PayResponse = z.infer<typeof PayResponse>;

// ---------- Approvals ----------

export const ApprovalStatus = z.enum(["pending", "approved", "rejected"]);
export const Approval = z.object({
  id: z.string(),
  cartId: z.string(),
  status: ApprovalStatus,
  decidedAt: z.string().nullable(),
});
export type Approval = z.infer<typeof Approval>;

// ---------- Live events (SSE) ----------

export const LiveEvent = z.object({
  type: z.enum(["check", "approval", "payment", "dispute", "agent"]),
  cartId: z.string().optional(),
  decision: Decision.optional(),
  summary: z.string(),
  at: z.string(),
});
export type LiveEvent = z.infer<typeof LiveEvent>;

// ---------- Detector HTTP contract (apps/agent -> apps/api) ----------

export const DetectRequest = z.object({
  userRequest: z.string().default(""),
  cart: Cart,
  pageText: z.string().default(""),
});
export type DetectRequest = z.infer<typeof DetectRequest>;


// ---------- Additive additions for Phase 2 ----------

export const ReceiptType = z.enum([
  "mandate_created",
  "mandate_revoked",
  "mandate_updated",
  "check",
  "approval",
  "payment",
  "dispute",
  "dispute_evidence",
]);
export type ReceiptType = z.infer<typeof ReceiptType>;

export const Receipt = z.object({
  id: z.string(),
  mandateId: z.string(),
  seq: z.number().int().positive(),
  type: z.string(),
  payload: z.string(),
  prevHash: z.string(),
  hash: z.string(),
  createdAt: z.string(),
});
export type Receipt = z.infer<typeof Receipt>;

export const CreateMandateRequest = z.object({
  userId: z.string(),
  rules: Rules,
  id: z.string().optional(),
});
export type CreateMandateRequest = z.infer<typeof CreateMandateRequest>;

export const CreateMandateResponse = z.object({
  mandate: Mandate,
  approveUrl: z.string().nullable(),
});
export type CreateMandateResponse = z.infer<typeof CreateMandateResponse>;

export const VerifyResponse = z.object({
  ok: z.boolean(),
  brokenSeq: z.number().int().nullable().optional(),
  checked: z.number().int().nonnegative(),
});
export type VerifyResponse = z.infer<typeof VerifyResponse>;

export const ApprovalDecisionRequest = z.object({
  approved: z.boolean(),
});
export type ApprovalDecisionRequest = z.infer<typeof ApprovalDecisionRequest>;

export const ApprovalStatusResponse = z.object({
  status: ApprovalStatus,
});
export type ApprovalStatusResponse = z.infer<typeof ApprovalStatusResponse>;

export const LiveEventV2 = z.object({
  type: z.enum(["mandate", "check", "approval", "payment", "dispute", "agent"]),
  mandateId: z.string().optional(),
  cartId: z.string().optional(),
  approvalId: z.string().optional(),
  decision: Decision.optional(),
  summary: z.string(),
  at: z.string(),
  items: z.array(CartItem).optional(),
  total: z.number().optional(),
  reasons: z.array(z.string()).optional(),
  riskScore: z.number().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type LiveEventV2 = z.infer<typeof LiveEventV2>;

// ---------- Disputes (Phase 5, additive) ----------

export const DisputeStatus = z.enum(["open", "evidence_submitted", "won", "lost", "error"]);
export type DisputeStatus = z.infer<typeof DisputeStatus>;

/** What the dashboard's "View evidence" drawer shows. */
export const DisputeEvidence = z.object({
  disputeId: z.string(),
  generatedAt: z.string(),
  mandate: z.object({
    id: z.string(),
    userId: z.string(),
    rules: Rules,
    signature: z.string(),
    publicKey: z.string(),
    signatureValid: z.boolean(),
    createdAt: z.string(),
  }),
  cart: z.object({
    id: z.string(),
    decision: Decision,
    reasons: z.array(z.string()),
    riskScore: z.number(),
    total: z.number(),
    items: z.array(z.record(z.string(), z.unknown())),
    userRequest: z.string().optional(),
  }),
  approval: z.object({ id: z.string(), status: z.string(), decidedAt: z.string().nullable() }).nullable(),
  payment: z.object({
    id: z.string(),
    paypalOrderId: z.string(),
    captureId: z.string().nullable(),
    amount: z.number(),
    status: z.string(),
  }),
  receipts: z.array(Receipt),
  chain: z.object({ ok: z.boolean(), brokenSeq: z.number().int().nullable().optional(), checked: z.number().int() }),
  summary: z.string(),
});
export type DisputeEvidence = z.infer<typeof DisputeEvidence>;

export const DisputeView = z.object({
  id: z.string(),
  paypalDisputeId: z.string(),
  paymentId: z.string().nullable(),
  cartId: z.string().nullable(),
  captureId: z.string().nullable(),
  reason: z.string().nullable(),
  amount: z.number().nullable(),
  status: DisputeStatus,
  submittedAt: z.string().nullable(),
  createdAt: z.string(),
  lastError: z.string().nullable().optional(),
  evidence: DisputeEvidence.nullable(),
});
export type DisputeView = z.infer<typeof DisputeView>;
