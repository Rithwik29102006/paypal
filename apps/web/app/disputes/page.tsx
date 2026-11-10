"use client";

import React, { useState } from "react";
import { useMandate } from "@/lib/state";
import { evidencePdfUrl } from "@/lib/api";
import { formatCurrency, formatDate, truncateHash } from "@/lib/utils";
import {
  Scale,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ExternalLink,
  ArrowRight,
  Send,
  Lock,
  Layers,
  Sparkles,
  X,
} from "lucide-react";

export default function DisputesPage() {
  const { disputes, defendDispute, resolveDispute, apiConnected, lastError } = useMandate();
  const [selectedDisputeId, setSelectedDisputeId] = useState<string | null>(null);
  const [defendingId, setDefendingId] = useState<string | null>(null);

  const selectedDispute = disputes.find((d) => d.id === selectedDisputeId);

  const handleDefend = async (id: string) => {
    setDefendingId(id);
    await defendDispute(id);
    setDefendingId(null);
  };

  const handleResolve = async (id: string) => {
    setDefendingId(id);
    await resolveDispute(id, "won");
    setDefendingId(null);
  };

  return (
    <div className="max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Dispute Defender
            </h1>
            <p className="text-xs text-slate-500">
              When a buyer files a false claim ("I never ordered this"), Mandate compiles the Ed25519-signed rules and receipt chain slice as irrefutable evidence.
            </p>
          </div>
        </div>

        <div
          className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl border ${
            apiConnected ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-amber-50 text-amber-800 border-amber-200"
          }`}
        >
          {apiConnected ? <ShieldCheck className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
          <span>{apiConnected ? "Connected to Mandate API (PayPal Disputes)" : "Mandate API offline"}</span>
        </div>
      </div>

      {lastError && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">{lastError}</div>
      )}

      {/* Disputes List */}
      <div className="space-y-6">
        {disputes.length === 0 && (
          <div className="p-6 bg-white rounded-2xl border border-dashed border-slate-300 text-xs text-slate-500 space-y-1">
            <p className="font-semibold text-slate-700">No disputes yet.</p>
            <p>
              Disputes arrive from PayPal webhooks (CUSTOMER.DISPUTE.CREATED). For a local demo run{" "}
              <code className="font-mono bg-slate-100 px-1 rounded">pnpm --filter @mandate/api replay:dispute</code> (mock mode, labelled as a replay), or import a real sandbox dispute with{" "}
              <code className="font-mono bg-slate-100 px-1 rounded">import:dispute -- PP-D-...</code>.
            </p>
          </div>
        )}
        {disputes.map((d) => {
          const isOpen = d.status === "open";
          const isSubmitted = d.status === "evidence_submitted";
          const isWon = d.status === "won";

          return (
            <div
              key={d.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            >
              {/* Header Bar */}
              <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs uppercase font-bold px-3 py-1 rounded-full border ${
                      isWon
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : isSubmitted
                        ? "bg-amber-50 text-amber-800 border-amber-200"
                        : "bg-rose-50 text-rose-800 border-rose-200"
                    }`}
                  >
                    {isWon ? "WON" : isSubmitted ? "EVIDENCE SUBMITTED" : d.status === "lost" ? "LOST" : d.status.toUpperCase()}
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-800">
                    Dispute ID: {d.paypalDisputeId}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-500 font-medium">Disputed Amount:</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    {d.amount === null ? "-" : formatCurrency(d.amount)}
                  </span>
                </div>
              </div>

              {/* Status Progression Bar */}
              <div className="px-6 py-4 bg-slate-50/70 border-b border-slate-100">
                <div className="flex items-center justify-between max-w-2xl mx-auto text-xs font-medium">
                  {/* Step 1 */}
                  <div className="flex items-center gap-2 text-slate-800">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold">
                      ✓
                    </span>
                    <span>1. Claim Filed</span>
                  </div>
                  <div className="flex-1 h-0.5 mx-3 bg-slate-200" />

                  {/* Step 2 */}
                  <div
                    className={`flex items-center gap-2 ${
                      isSubmitted || isWon ? "text-slate-800" : "text-slate-400"
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        isSubmitted || isWon
                          ? "bg-slate-800 text-white"
                          : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {isSubmitted || isWon ? "✓" : "2"}
                    </span>
                    <span>2. Evidence Built</span>
                  </div>
                  <div className="flex-1 h-0.5 mx-3 bg-slate-200" />

                  {/* Step 3 */}
                  <div
                    className={`flex items-center gap-2 ${
                      isSubmitted || isWon ? "text-brand-700 font-bold" : "text-slate-400"
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        isWon
                          ? "bg-slate-800 text-white"
                          : isSubmitted
                          ? "bg-brand-600 text-white"
                          : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {isWon ? "✓" : "3"}
                    </span>
                    <span>3. Submitted to PayPal</span>
                  </div>
                  <div className="flex-1 h-0.5 mx-3 bg-slate-200" />

                  {/* Step 4 */}
                  <div
                    className={`flex items-center gap-2 ${
                      isWon ? "text-emerald-700 font-bold" : "text-slate-400"
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        isWon ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {isWon ? "✓" : "4"}
                    </span>
                    <span>4. Dispute Won</span>
                  </div>
                </div>
              </div>

              {/* Dispute Details */}
              <div className="p-6 space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-slate-400 font-medium block mb-0.5">Claim Reason:</span>
                    <strong className="text-slate-800">{d.reason}</strong>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-slate-400 font-medium block mb-0.5">Customer's request to the agent:</span>
                    <strong className="text-slate-800">{d.evidence?.cart.userRequest ?? "-"}</strong>
                    <span className="block text-[11px] text-slate-500 font-mono">Cart {d.cartId ?? "not linked"}</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-slate-400 font-medium block mb-0.5">PayPal Order ID:</span>
                    <strong className="text-slate-800 font-mono">{d.evidence?.payment.paypalOrderId ?? "-"}</strong>
                    <span className="block text-[11px] text-slate-500">Capture: {d.captureId ?? "-"}</span>
                  </div>
                </div>

                {d.lastError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-[11px]">{d.lastError}</div>
                )}

                {isWon && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <strong className="block text-sm font-bold text-emerald-950">Dispute resolved in the merchant's favour</strong>
                      <p className="text-xs text-emerald-800 leading-relaxed">
                        PayPal received the Ed25519-signed mandate, the /check decision and the SHA-256 receipt chain slice through{" "}
                        <code className="font-mono bg-emerald-100/60 px-1 py-0.5 rounded text-[11px]">provide-evidence</code>.
                        {d.paypalDisputeId.includes("REPLAY") ? " (Replayed dispute in mock mode, not a real PayPal case.)" : ""}
                      </p>
                    </div>
                  </div>
                )}

                {/* Actions Row */}
                <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <button
                    onClick={() => setSelectedDisputeId(d.id)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <FileText className="w-4 h-4 text-slate-500" />
                    Inspect Evidence Package
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    {d.evidence && (
                      <a
                        href={evidencePdfUrl(d.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition-colors flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-4 h-4 text-slate-500" />
                        Evidence PDF
                      </a>
                    )}
                    {(isOpen || d.status === "error") && (
                      <button
                        onClick={() => handleDefend(d.id)}
                        disabled={defendingId === d.id || !d.paymentId}
                        className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-md shadow-brand-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
                      >
                        <Send className="w-4 h-4" />
                        Build & Submit Defense Package
                      </button>
                    )}
                    {isSubmitted && (
                      <button
                        onClick={() => handleResolve(d.id)}
                        disabled={defendingId === d.id}
                        title="Sandbox only: asks PayPal's sandbox to rule on the dispute (adjudicate)"
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Scale className="w-4 h-4" />
                        Request sandbox ruling
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Evidence Package Drawer / Modal */}
      {selectedDispute && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand-600" />
                <h3 className="font-bold text-slate-900 text-lg">
                  PayPal Dispute Evidence Package
                </h3>
              </div>
              <button
                onClick={() => setSelectedDisputeId(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Payload compiled for <strong>POST /v1/customer/disputes/{selectedDispute.paypalDisputeId}/provide-evidence</strong>:
            </p>

            <div className="space-y-4 text-xs font-mono">
              {/* Evidence Slice 1: Signed Mandate */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5">
                <strong className="text-slate-900 block font-sans text-xs flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-brand-600" />
                  1. Cryptographic Mandate & User Signature
                </strong>
                <p className="text-slate-600 text-[11px]">
                  Mandate ID: <strong>{selectedDispute.evidence?.mandate.id}</strong> (User: {selectedDispute.evidence?.mandate.userId}) · Signature{" "}
                  <strong className={selectedDispute.evidence?.mandate.signatureValid ? "text-emerald-700" : "text-rose-700"}>
                    {selectedDispute.evidence?.mandate.signatureValid ? "VALID" : "INVALID"}
                  </strong>
                </p>
                <p className="text-slate-600 text-[11px]">
                  Signature: <strong className="text-brand-700 break-all">{selectedDispute.evidence?.mandate.signature}</strong>
                </p>
                <p className="text-slate-600 text-[11px]">
                  PublicKey: <span className="break-all">{truncateHash(selectedDispute.evidence?.mandate.publicKey ?? "", 24)}</span>
                </p>
                <p className="text-slate-600 text-[11px]">
                  Allowed Categories: {selectedDispute.evidence?.mandate.rules.allowedCategories.join(", ")}
                </p>
              </div>

              {/* Evidence Slice 2: Receipt Chain Slice */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5">
                <strong className="text-slate-900 block font-sans text-xs flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-brand-600" />
                  2. SHA-256 Receipt Chain Slice
                </strong>
                <p className="text-slate-600 text-[11px]">
                  Chain: <strong>{selectedDispute.evidence?.chain.ok ? `verified (${selectedDispute.evidence?.chain.checked} receipts)` : `BROKEN at #${selectedDispute.evidence?.chain.brokenSeq}`}</strong>
                </p>
                {(selectedDispute.evidence?.receipts ?? []).map((r) => (
                  <div key={r.seq} className="text-[11px] text-slate-600 border-t border-slate-200/60 pt-1 mt-1">
                    seq #{r.seq} [{r.type}] · hash: <strong className="text-slate-800">{truncateHash(r.hash, 8)}</strong>
                  </div>
                ))}
              </div>

              {/* Evidence Slice 3: Check Decision */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5">
                <strong className="text-slate-900 block font-sans text-xs flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  3. Pre-Payment /check Decision Audit
                </strong>
                <p className="text-slate-600 text-[11px]">
                  Verdict: <strong className="text-emerald-700 font-bold">{selectedDispute.evidence?.cart.decision.toUpperCase()}</strong> · Risk: {selectedDispute.evidence?.cart.riskScore}
                  {selectedDispute.evidence?.approval ? ` · Customer ${selectedDispute.evidence.approval.status} at ${formatDate(selectedDispute.evidence.approval.decidedAt ?? "")}` : ""}
                </p>
                <p className="text-slate-600 text-[11px]">
                  Reasons: {selectedDispute.evidence?.cart.reasons.join("; ")}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedDisputeId(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
