"use client";

import React, { useState } from "react";
import { useMandate } from "@/lib/state";
import { formatDate, truncateHash } from "@/lib/utils";
import {
  Receipt as ReceiptIcon,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Hash,
  Link as LinkIcon,
  ChevronDown,
  ChevronUp,
  FileText,
  RotateCcw,
  Sparkles,
} from "lucide-react";

export default function ReceiptsPage() {
  const {
    receipts,
    verifyChain,
    verificationResult,
    isVerifying,
    tamperReceipt,
    restoreReceipts,
  } = useMandate();

  const [expandedSeq, setExpandedSeq] = useState<number | null>(null);

  const toggleExpand = (seq: number) => {
    setExpandedSeq(expandedSeq === seq ? null : seq);
  };

  return (
    <div className="max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
            <ReceiptIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Tamper-Proof Receipt Log
            </h1>
            <p className="text-xs text-slate-500">
              SHA-256 hash-chained append-only ledger. Every check, decision, and payment is permanently linked.
            </p>
          </div>
        </div>

        {/* Verification & Tamper Demo Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => tamperReceipt(2)}
            className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
            title="Tampering is done server-side: run `pnpm tamper -- 2` in a terminal, then click Verify"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            How to tamper (#2)
          </button>

          <button
            onClick={restoreReceipts}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
            title="Reload the receipt chain from the Mandate API (run `pnpm seed` to repair a tampered demo chain)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reload
          </button>

          <button
            onClick={verifyChain}
            disabled={isVerifying}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? "animate-spin" : ""}`} />
            Verify Chain Integrity
          </button>
        </div>
      </div>

      {/* Verification Result Banner */}
      {verificationResult && (
        <div
          className={`p-5 rounded-2xl border text-xs animate-in fade-in flex items-start gap-3.5 ${
            verificationResult.valid
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-300 text-rose-950"
          }`}
        >
          {verificationResult.valid ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <h3 className="font-bold text-sm">
              {verificationResult.valid
                ? `Cryptographic Audit Passed: All ${verificationResult.checkedCount} Receipts Valid`
                : `CHAIN INTEGRITY FAILURE: Tampering Detected at Sequence #${verificationResult.brokenSeq}!`}
            </h3>
            <p className="leading-relaxed">
              {verificationResult.valid
                ? "Every SHA-256 block hash matches sha256(prevHash + canonicalize(payload)). The chain is 100% authentic and tamper-free."
                : `Block #${verificationResult.brokenSeq} has been modified! Its calculated hash does not match the ledger or breaks the next block's prevHash.`}
            </p>
          </div>
        </div>
      )}

      {/* Receipt Timeline */}
      <div className="relative pl-6 sm:pl-8 space-y-6 before:content-[''] before:absolute before:left-3 sm:before:left-4 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-200">
        {receipts.map((r, index) => {
          const isExpanded = expandedSeq === r.seq;
          const isTampered = Boolean(r.tampered);

          let typeColor = "bg-slate-100 text-slate-700 border-slate-200";
          if (r.type === "payment") typeColor = "bg-emerald-50 text-emerald-800 border-emerald-200";
          if (r.type === "check") typeColor = "bg-brand-50 text-brand-800 border-brand-200";
          if (r.type === "approval") typeColor = "bg-amber-50 text-amber-800 border-amber-200";
          if (r.type === "mandate_created") typeColor = "bg-purple-50 text-purple-800 border-purple-200";
          if (r.type === "dispute_evidence") typeColor = "bg-sky-50 text-sky-800 border-sky-200";

          return (
            <div key={r.seq} className="relative">
              {/* Timeline Node Dot */}
              <div
                className={`absolute -left-[27px] sm:-left-[35px] top-4 w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] text-white border-2 border-white shadow-sm ${
                  isTampered
                    ? "bg-rose-600 animate-pulse ring-4 ring-rose-200"
                    : "bg-brand-600"
                }`}
              >
                {r.seq}
              </div>

              {/* Receipt Card */}
              <div
                className={`bg-white rounded-2xl border shadow-sm transition-all overflow-hidden ${
                  isTampered
                    ? "border-rose-400 ring-2 ring-rose-200"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                {/* Header */}
                <div
                  onClick={() => toggleExpand(r.seq)}
                  className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs uppercase font-bold px-2.5 py-1 rounded-md border ${typeColor}`}
                    >
                      {r.type.replace("_", " ")}
                    </span>
                    <span className="font-bold text-sm text-slate-800">
                      Receipt Sequence #{r.seq}
                    </span>
                    {isTampered && (
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                        TAMPERED DATA
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-slate-400 font-mono text-[11px]">
                      {formatDate(r.createdAt)}
                    </span>
                    <button className="text-slate-400 hover:text-slate-600">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Hashes Row */}
                <div className="px-5 py-2.5 bg-slate-50/80 border-t border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <LinkIcon className="w-3.5 h-3.5 text-slate-400" />
                    <span>prevHash:</span>
                    <span className="text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {truncateHash(r.prevHash, 6)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Hash className="w-3.5 h-3.5 text-brand-500" />
                    <span>hash:</span>
                    <span className="text-brand-700 font-semibold bg-white px-2 py-0.5 rounded border border-brand-200">
                      {truncateHash(r.hash, 8)}
                    </span>
                  </div>
                </div>

                {/* Summary / Snippet */}
                <div className="p-5 text-xs text-slate-700 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-500 font-medium">Payload Summary:</span>
                    <button
                      onClick={() => toggleExpand(r.seq)}
                      className="text-brand-600 hover:text-brand-700 font-semibold"
                    >
                      {isExpanded ? "Hide canonical JSON" : "Inspect canonical JSON"}
                    </button>
                  </div>

                  {/* Quick Highlight of Key Fields */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-slate-800 font-mono text-[11px]">
                    {r.type === "payment" && r.payload.tampered !== true && (
                      <p>
                        Order: <strong>{r.payload.paypalOrderId}</strong> · Amount:{" "}
                        <strong className="text-emerald-700 font-bold">${r.payload.amount}</strong> ·
                        Status: {r.payload.status}
                      </p>
                    )}
                    {r.payload.tampered === true && (
                      <p className="text-rose-700 font-bold">
                        This receipt was modified after it was written. Run Verify to see the chain break here.
                      </p>
                    )}
                    {r.type === "check" && r.payload.tampered !== true && (
                      <p>
                        Decision:{" "}
                        <strong
                          className={
                            r.payload.decision === "block"
                              ? "text-rose-600"
                              : r.payload.decision === "allow"
                              ? "text-emerald-600"
                              : "text-amber-600"
                          }
                        >
                          {String(r.payload.decision ?? "?").toUpperCase()}
                        </strong>{" "}
                        · Risk: {r.payload.riskScore} · {r.payload.reasons?.[0]}
                      </p>
                    )}
                    {r.type === "mandate_created" && (
                      <p>
                        Mandate: <strong>{r.payload.mandateId}</strong> · Cap: $
                        {r.payload.rules?.monthlyCap ?? "-"} · Vault: {r.payload.vaultId ? `${String(r.payload.vaultId).slice(0, 16)}...` : "not connected"}
                      </p>
                    )}
                    {r.type === "approval" && r.payload.tampered !== true && (
                      <p>
                        Status: <strong>{r.payload.status ?? r.payload.decision}</strong> · Approval {r.payload.approvalId ?? ""}
                      </p>
                    )}
                  </div>

                  {/* Expandable Canonical JSON */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-100 animate-in fade-in">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block mb-1">
                        Canonical JSON Payload (Used for SHA-256 Hashing)
                      </span>
                      <pre className="p-3 bg-slate-900 text-slate-200 rounded-xl overflow-x-auto text-[11px] font-mono leading-relaxed max-h-60">
                        {JSON.stringify(r.payload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
