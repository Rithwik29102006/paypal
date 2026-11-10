/**
 * One-page PDF summary of a dispute evidence package, attached to PayPal's
 * provide-evidence call and downloadable from the dashboard.
 */
import PDFDocument from "pdfkit";
import type { DisputeEvidence } from "@mandate/shared";

export function renderEvidencePdf(e: DisputeEvidence): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Mandate evidence ${e.disputeId}` } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const h = (t: string) => doc.moveDown(0.6).font("Helvetica-Bold").fontSize(12).text(t).font("Helvetica").fontSize(9.5);
    const kv = (k: string, v: string) => doc.font("Helvetica-Bold").text(`${k}: `, { continued: true }).font("Helvetica").text(v);

    doc.font("Helvetica-Bold").fontSize(16).text("Mandate: proof of authorised purchase");
    doc.font("Helvetica").fontSize(9.5).fillColor("#444").text(`PayPal dispute ${e.disputeId} · generated ${e.generatedAt}`).fillColor("#000");

    doc.moveDown(0.6).fontSize(10.5).text(e.summary);

    h("1. The customer's signed spending mandate");
    kv("Mandate", `${e.mandate.id} (user ${e.mandate.userId}, created ${e.mandate.createdAt})`);
    kv("Rules", `${e.mandate.rules.currency} ${e.mandate.rules.monthlyCap}/month, ${e.mandate.rules.perTxCap} per purchase, ask above ${e.mandate.rules.approvalAbove}; categories ${e.mandate.rules.allowedCategories.join(", ")}; merchants ${e.mandate.rules.allowedMerchants.join(", ")}`);
    kv("Ed25519 signature", `${e.mandate.signatureValid ? "VALID" : "INVALID"} (${e.mandate.signature.slice(0, 44)}...)`);

    h("2. The purchase and the rules check");
    kv("Cart", `${e.cart.id}, total ${e.cart.total.toFixed(2)} USD, decision ${e.cart.decision.toUpperCase()}, risk ${e.cart.riskScore}`);
    if (e.cart.userRequest) kv("Customer's request to the agent", `"${e.cart.userRequest}"`);
    kv("Reasons", e.cart.reasons.join("; ") || "-");
    for (const it of e.cart.items.slice(0, 12)) {
      doc.text(`  - ${String(it.qty ?? 1)} x ${String(it.name ?? it.sku ?? "item")} @ ${String(it.unitPrice ?? "")} (${String(it.category ?? "")}, ${String(it.merchant ?? "")})`);
    }
    if (e.approval) kv("Customer approval", `${e.approval.status} at ${e.approval.decidedAt ?? "-"} (${e.approval.id})`);

    h("3. Payment");
    kv("PayPal order", e.payment.paypalOrderId);
    kv("Capture", `${e.payment.captureId ?? "-"}, ${e.payment.amount.toFixed(2)} USD, ${e.payment.status}`);

    h("4. Tamper-evident receipt chain (SHA-256)");
    kv("Chain verification", e.chain.ok ? `OK, ${e.chain.checked} receipts verified` : `BROKEN at seq ${e.chain.brokenSeq}`);
    for (const r of e.receipts.slice(0, 14)) {
      const when = r.createdAt.replace("T", " ").slice(0, 19);
      doc.font("Courier").fontSize(8).text(`#${String(r.seq).padEnd(3)} ${r.type.padEnd(16)} ${when}  hash ${r.hash.slice(0, 24)}  prev ${r.prevHash.slice(0, 10)}`);
    }
    doc.font("Helvetica").fontSize(8.5).fillColor("#444").moveDown(0.8)
      .text("Each receipt's hash covers its content and the previous receipt's hash, so any edit or deletion breaks verification. The mandate signature can be checked with the public key included in the JSON evidence.");

    doc.end();
  });
}
