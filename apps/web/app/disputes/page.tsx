"use client";

import React, { useState } from "react";
import { useMandate } from "@/lib/state";
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
  const { disputes, defendDispute, receipts, mandate } = useMandate();
  const [selectedDisputeId, setSelectedDisputeId] = useState<string | null>(null);
  const [defendingId, setDefendingId] = useState<string | null>(null);

  const selectedDispute = disputes.find((d) => d.id === selectedDisputeId);

  const handleDefend = async (id: string) => {
    setDefendingId(id);
    await defendDispute(id);
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

        <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <span>PayPal Disputes API: Simulated Demo (apps/api not connected)</span>
        </div>
      </div>

      {/* Disputes List */}
      <div className="space-y-6">
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
                    {isWon
                      ? "WON (SIMULATED)"
                      : isSubmitted
                      ? "DEMO SUBMISSION SIMULATED"
                      : d.status.toUpperCase()}
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-800">
                    Dispute ID: {d.paypalDisputeId}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-500 font-medium">Disputed Amount:</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    {formatCurrency(d.amount)}
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
                    <span>3. Demo submission simulated</span>
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
                    <span className="text-slate-400 font-medium block mb-0.5">Buyer Account:</span>
                    <strong className="text-slate-800">{d.buyerName}</strong>
                    <span className="block text-[11px] text-slate-500 font-mono">{d.buyerEmail}</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-slate-400 font-medium block mb-0.5">PayPal Order ID:</span>
                    <strong className="text-slate-800 font-mono">{d.paypalOrderId}</strong>
                    <span className="block text-[11px] text-slate-500">Capture: 3C679366HH908993F</span>
                  </div>
                </div>

                {isWon && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="block text-sm font-bold text-emerald-950">
                          SIMULATED DEMO — PayPal API not connected
                        </strong>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-200/70 text-emerald-900 uppercase">
                          Demo Outcome: Won
                        </span>
                      </div>
                      <p className="text-xs text-emerald-800 leading-relaxed">
                        The evidence package (Ed25519-signed rules, SHA-256 receipt chain slice, and /check decision) was compiled and verified locally. Once Member 2's backend is connected, this exact package is dispatched via PayPal's Disputes API (<code className="font-mono bg-emerald-100/60 px-1 py-0.5 rounded text-[11px]">POST /v1/customer/disputes/&#123;id&#125;/provide-evidence</code>).
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

                  {isOpen && (
                    <button
                      onClick={() => handleDefend(d.id)}
                      disabled={defendingId === d.id}
                      className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-md shadow-brand-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      Build & Submit Defense Package
                    </button>
                  )}

                  {isSubmitted && (
                    <span className="text-amber-700 font-semibold flex items-center gap-1.5 text-xs">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      Demo submission simulated (Simulating review...)
                    </span>
                  )}
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
                  Mandate ID: <strong>{mandate.id}</strong> (User: {mandate.userId})
                </p>
                <p className="text-slate-600 text-[11px]">
                  Signature: <strong className="text-brand-700">{mandate.signature}</strong>
                </p>
                <p className="text-slate-600 text-[11px]">
                  PublicKey: {mandate.publicKey}
                </p>
                <p className="text-slate-600 text-[11px]">
                  Allowed Categories: {mandate.rules.allowedCategories.join(", ")}
                </p>
              </div>

              {/* Evidence Slice 2: Receipt Chain Slice */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5">
                <strong className="text-slate-900 block font-sans text-xs flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-brand-600" />
                  2. SHA-256 Receipt Chain Slice
                </strong>
                {receipts.slice(0, 3).map((r) => (
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
                  Verdict: <strong className="text-emerald-700 font-bold">ALLOW</strong> · Risk: 0.05
                </p>
                <p className="text-slate-600 text-[11px]">
                  Confirmed: Groceries within monthly cap ($10.47 &lt; $300.00)
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
