/**
 * Dispute defender. When a buyer disputes a captured payment ("I never
 * ordered this"), build the evidence that the purchase was authorised: the
 * signed mandate, the /check decision, the approval, the payment, and the
 * hash-chained receipts for that cart. Submit it to PayPal and record it.
 */
import { createHash, randomUUID } from "node:crypto";
import { DisputeEvidence, Rules, type DisputeStatus, type DisputeView, type LiveEventV2 } from "@mandate/shared";
import { config } from "./config.js";
import { verifyMandate } from "./crypto/signing.js";
import { prisma } from "./db.js";
import { renderEvidencePdf } from "./evidencePdf.js";
import { publish } from "./events.js";
import { appendReceipt, verifyChain } from "./receipts.js";
import type { PayPalClient } from "./paypal/types.js";

export class DisputeError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
  }
}

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

/** PayPal webhook resource for CUSTOMER.DISPUTE.* events (fields we use). */
export interface DisputeResource {
  dispute_id?: string;
  id?: string;
  reason?: string;
  status?: string;
  dispute_amount?: { currency_code?: string; value?: string };
  disputed_transactions?: Array<{ seller_transaction_id?: string }>;
  dispute_outcome?: { outcome_code?: string };
}

/** RESOLVED_SELLER_FAVOUR -> won, RESOLVED_BUYER_FAVOUR -> lost (PayPal spells it "FAVOUR"). */
export function outcomeToStatus(outcomeCode: string | undefined): "won" | "lost" | null {
  if (!outcomeCode) return null;
  if (/SELLER_FAVOU?R/.test(outcomeCode)) return "won";
  if (/BUYER_FAVOU?R/.test(outcomeCode)) return "lost";
  return null;
}

function emit(e: Omit<LiveEventV2, "type" | "at">) {
  publish({ type: "dispute", at: new Date().toISOString(), ...e });
}

/** Creates (or returns) the local Dispute row for a PayPal dispute. Idempotent. */
export async function recordDispute(resource: DisputeResource) {
  const disputeId = resource.dispute_id ?? resource.id;
  if (!disputeId) throw new DisputeError("dispute resource has no dispute_id", 400);

  const existing = await prisma.dispute.findUnique({ where: { disputeId } });
  if (existing) return existing;

  const captureId = resource.disputed_transactions?.find((t) => t.seller_transaction_id)?.seller_transaction_id ?? null;
  const payment = captureId ? await prisma.payment.findFirst({ where: { captureId } }) : null;
  const value = resource.dispute_amount?.value;

  const row = await prisma.dispute.create({
    data: {
      id: `dsp_${randomUUID().slice(0, 8)}`,
      disputeId,
      paymentId: payment?.id ?? null,
      captureId,
      status: "open",
      reason: resource.reason ?? null,
      amountCents: value ? Math.round(Number(value) * 100) : payment?.amountCents ?? null,
      currency: resource.dispute_amount?.currency_code ?? "USD",
      lastError: payment ? null : `no captured payment matches transaction ${captureId ?? "(none)"}`,
    },
  });

  if (payment) {
    await appendReceipt(payment.mandateId, "dispute", { disputeId, paymentId: payment.id, cartId: payment.cartId, status: "open", reason: resource.reason ?? null });
    emit({ mandateId: payment.mandateId, cartId: payment.cartId, summary: `Dispute ${disputeId} opened: ${resource.reason ?? "unknown reason"}` });
  }
  return row;
}

/** Builds the evidence package for a dispute's payment. */
export async function buildEvidence(disputeRowId: string): Promise<DisputeEvidence> {
  const dispute = await prisma.dispute.findUnique({ where: { id: disputeRowId } });
  if (!dispute) throw new DisputeError("dispute not found", 404);
  if (!dispute.paymentId) throw new DisputeError(dispute.lastError ?? "dispute is not linked to a payment", 422);

  const payment = await prisma.payment.findUnique({ where: { id: dispute.paymentId } });
  if (!payment) throw new DisputeError("payment not found", 404);
  const cart = await prisma.cart.findUnique({ where: { id: payment.cartId }, include: { approval: true } });
  if (!cart) throw new DisputeError("cart not found", 404);
  const mandate = await prisma.mandate.findUnique({ where: { id: cart.mandateId } });
  if (!mandate) throw new DisputeError("mandate not found", 404);

  const rules = Rules.parse(JSON.parse(mandate.rulesJson));
  const createdAt = mandate.createdAt.toISOString();
  const signatureValid = verifyMandate({
    rules,
    id: mandate.id,
    createdAt,
    signature: mandate.signature,
    publicKey: mandate.publicKey,
    vaultId: mandate.vaultId,
  });

  const request = JSON.parse(cart.requestJson) as { userRequest?: string; cart?: { items?: Array<Record<string, unknown>>; total?: number } };
  const allReceipts = await prisma.receipt.findMany({ where: { mandateId: mandate.id }, orderBy: { seq: "asc" } });
  const slice = allReceipts.filter((r) => {
    if (r.type === "mandate_created" || r.type === "mandate_updated") return true;
    try {
      return (JSON.parse(r.payload) as { cartId?: string }).cartId === cart.id;
    } catch {
      return false;
    }
  });
  const chain = await verifyChain(mandate.id);
  const total = cart.totalCents / 100;
  const approved = cart.approval?.status === "approved";

  const summary =
    `This payment was made by the customer's own AI shopping agent under a spending mandate the customer signed on ${createdAt.slice(0, 10)}. ` +
    `Before PayPal was charged, Mandate checked the cart against those rules: decision ${cart.decision.toUpperCase()}` +
    (approved ? `, and the customer explicitly approved it at ${cart.approval?.decidedAt?.toISOString()}` : "") +
    `. The mandate signature is ${signatureValid ? "valid" : "INVALID"} and the receipt chain ${chain.ok ? "verifies end to end" : "is broken"}.`;

  return DisputeEvidence.parse({
    disputeId: dispute.disputeId,
    generatedAt: new Date().toISOString(),
    mandate: { id: mandate.id, userId: mandate.userId, rules, signature: mandate.signature, publicKey: mandate.publicKey, signatureValid, createdAt },
    cart: {
      id: cart.id,
      decision: cart.decision,
      reasons: JSON.parse(cart.reasonsJson) as string[],
      riskScore: cart.riskScore,
      total,
      items: request.cart?.items ?? [],
      userRequest: request.userRequest || undefined,
    },
    approval: cart.approval ? { id: cart.approval.id, status: cart.approval.status, decidedAt: cart.approval.decidedAt?.toISOString() ?? null } : null,
    payment: { id: payment.id, paypalOrderId: payment.paypalOrderId, captureId: payment.captureId, amount: payment.amountCents / 100, status: payment.status },
    receipts: slice.map((r) => ({ id: r.id, mandateId: r.mandateId, seq: r.seq, type: r.type, payload: r.payload, prevHash: r.prevHash, hash: r.hash, createdAt: r.createdAt.toISOString() })),
    chain: { ok: chain.ok, brokenSeq: chain.brokenSeq ?? null, checked: chain.checked },
    summary,
  });
}

/** Builds the evidence, submits it to PayPal (with the PDF), and records it. */
export async function defendDispute(disputeRowId: string, paypal: PayPalClient): Promise<DisputeView> {
  const dispute = await prisma.dispute.findUnique({ where: { id: disputeRowId } });
  if (!dispute) throw new DisputeError("dispute not found", 404);
  if (dispute.status === "won" || dispute.status === "lost") throw new DisputeError(`dispute already ${dispute.status}`, 409);

  let evidence: DisputeEvidence;
  try {
    evidence = await buildEvidence(disputeRowId);
  } catch (err) {
    await prisma.dispute.update({ where: { id: disputeRowId }, data: { status: "error", lastError: (err as Error).message } });
    throw err;
  }
  const pdf = await renderEvidencePdf(evidence);
  const evidenceJson = JSON.stringify(evidence);

  try {
    if (config.PAYPAL_MODE === "sandbox") {
      // Sandbox disputes often start UNDER_REVIEW; evidence can only be given
      // while WAITING_FOR_SELLER_RESPONSE. require-evidence is sandbox-only.
      const remote = await paypal.getDispute(dispute.disputeId);
      if (remote.status === "UNDER_REVIEW") await paypal.requireEvidence(dispute.disputeId, randomUUID());
    }
    await paypal.provideEvidence(
      dispute.disputeId,
      { evidenceType: "OTHER", notes: evidence.summary, fileBuffer: pdf, fileName: `mandate-evidence-${dispute.disputeId}.pdf` },
      randomUUID()
    );
  } catch (err) {
    const message = (err as Error).message;
    await prisma.dispute.update({ where: { id: disputeRowId }, data: { evidenceJson, lastError: message } });
    throw new DisputeError(`PayPal provide-evidence failed: ${message}`, 502);
  }

  const updated = await prisma.dispute.update({
    where: { id: disputeRowId },
    data: { status: "evidence_submitted", submittedAt: new Date(), evidenceJson, lastError: null },
  });
  await appendReceipt(evidence.mandate.id, "dispute_evidence", {
    disputeId: dispute.disputeId,
    paymentId: evidence.payment.id,
    cartId: evidence.cart.id,
    evidenceSha256: sha256(evidenceJson),
    pdfSha256: sha256(pdf),
  });
  emit({ mandateId: evidence.mandate.id, cartId: evidence.cart.id, summary: `Evidence submitted to PayPal for dispute ${dispute.disputeId}` });
  return toView(updated);
}

/** Records a final outcome (from a webhook, or after a sandbox ruling). */
export async function setOutcome(disputeId: string, status: "won" | "lost", source: string) {
  const dispute = await prisma.dispute.findUnique({ where: { disputeId }, include: { payment: true } });
  if (!dispute) return null;
  if (dispute.status === status) return dispute;
  const updated = await prisma.dispute.update({ where: { id: dispute.id }, data: { status } });
  if (dispute.payment) {
    await appendReceipt(dispute.payment.mandateId, "dispute", { disputeId, paymentId: dispute.payment.id, cartId: dispute.payment.cartId, status, source });
    emit({ mandateId: dispute.payment.mandateId, cartId: dispute.payment.cartId, summary: `Dispute ${disputeId} ${status === "won" ? "WON" : "lost"} (${source})` });
  }
  return updated;
}

/**
 * SANDBOX/MOCK ONLY: asks PayPal to rule on the dispute (adjudicate), so the
 * demo can show a real outcome without waiting days for a human reviewer.
 */
export async function sandboxResolve(disputeRowId: string, outcome: "won" | "lost", paypal: PayPalClient): Promise<DisputeView> {
  const dispute = await prisma.dispute.findUnique({ where: { id: disputeRowId } });
  if (!dispute) throw new DisputeError("dispute not found", 404);
  if (dispute.status !== "evidence_submitted") throw new DisputeError("submit evidence before asking for a ruling", 409);
  try {
    await paypal.adjudicate(dispute.disputeId, outcome === "won" ? "SELLER_FAVOR" : "BUYER_FAVOR", randomUUID());
  } catch (err) {
    throw new DisputeError(`PayPal adjudicate failed: ${(err as Error).message}`, 502);
  }
  const updated = await setOutcome(dispute.disputeId, outcome, config.PAYPAL_MODE === "sandbox" ? "PayPal sandbox ruling" : "mock ruling");
  return toView(updated!);
}

export function toView(d: {
  id: string;
  disputeId: string;
  paymentId: string | null;
  captureId: string | null;
  reason: string | null;
  amountCents: number | null;
  status: string;
  submittedAt: Date | null;
  createdAt: Date;
  lastError?: string | null;
  evidenceJson: string | null;
}): DisputeView {
  const evidence = d.evidenceJson ? DisputeEvidence.parse(JSON.parse(d.evidenceJson)) : null;
  return {
    id: d.id,
    paypalDisputeId: d.disputeId,
    paymentId: d.paymentId,
    cartId: evidence?.cart.id ?? null,
    captureId: d.captureId,
    reason: d.reason,
    amount: d.amountCents === null ? null : d.amountCents / 100,
    status: (["open", "evidence_submitted", "won", "lost", "error"].includes(d.status) ? d.status : "open") as DisputeStatus,
    submittedAt: d.submittedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    lastError: d.lastError ?? null,
    evidence,
  };
}
