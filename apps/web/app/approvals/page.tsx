"use client";

import React, { useState } from "react";
import { useMandate } from "@/lib/state";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  CheckSquare,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  CreditCard,
  ShoppingBag,
  ExternalLink,
  Info,
} from "lucide-react";

export default function ApprovalsPage() {
  const { approvals, resolveApproval, mandate } = useMandate();
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [actingId, setActingId] = useState<string | null>(null);

  const displayed =
    filter === "pending"
      ? approvals.filter((a) => a.status === "pending")
      : approvals;

  const handleDecision = async (id: string, approved: boolean) => {
    setActingId(id);
    await resolveApproval(id, approved);
    setActingId(null);
  };

  return (
    <div className="max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <CheckSquare className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Purchase Approvals
            </h1>
            <p className="text-xs text-slate-500">
              Transactions that exceeded your <strong>${mandate.rules.approvalAbove} threshold</strong> or flagged moderate risk.
            </p>
          </div>
        </div>

        {/* Filter Toggle */}
        <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setFilter("pending")}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filter === "pending"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Pending ({approvals.filter((a) => a.status === "pending").length})
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filter === "all"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            All History ({approvals.length})
          </button>
        </div>
      </div>

      {/* Approvals List */}
      {displayed.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 space-y-3 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-800 text-sm">No Pending Approvals</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            All purchases are either under your ${mandate.rules.approvalAbove} threshold or have already been decided.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {displayed.map((item) => {
            const isPending = item.status === "pending";
            const isApproved = item.status === "approved";
            const isRejected = item.status === "rejected";

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
              >
                {/* Card Header Bar */}
                <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                        isPending
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : isApproved
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : "bg-rose-50 text-rose-800 border-rose-200"
                      }`}
                    >
                      {item.status.toUpperCase()}
                    </span>
                    <span className="font-mono text-xs text-slate-500 font-semibold">
                      Cart ID: {item.cartId}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg text-slate-600 font-medium">
                      <span>Risk Score:</span>
                      <strong
                        className={`font-mono ${
                          item.riskScore > 0.4 ? "text-amber-600" : "text-emerald-600"
                        }`}
                      >
                        {item.riskScore.toFixed(2)}
                      </strong>
                    </div>
                    <span className="text-slate-400 font-mono text-[11px]">
                      {formatDate(item.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-6 space-y-5">
                  {/* Reasons Banner */}
                  <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-start gap-3 text-xs text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block mb-0.5">Why this cart needs approval:</span>
                      <ul className="list-disc list-inside space-y-0.5 text-amber-800">
                        {item.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Agent Reasoning */}
                  {item.cart.agentReasoning && (
                  <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <strong className="text-slate-800 font-semibold block mb-0.5">
                      Agent's stated reasoning:
                    </strong>
                    <p className="italic">"{item.cart.agentReasoning}"</p>
                  </div>
                  )}

                  {/* Cart Items Table */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Proposed Items in Cart
                    </h4>
                    <div className="border border-slate-100 rounded-xl overflow-hidden text-xs">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                          <tr>
                            <th className="py-2.5 px-4">Product</th>
                            <th className="py-2.5 px-3">Category</th>
                            <th className="py-2.5 px-3 text-right">Price</th>
                            <th className="py-2.5 px-3 text-center">Qty</th>
                            <th className="py-2.5 px-4 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {item.cart.items.map((prod, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/60">
                              <td className="py-2.5 px-4 font-medium text-slate-800">
                                {prod.name}
                                <span className="block text-[10px] text-slate-400 font-mono">
                                  {prod.sku} · {prod.merchant}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 capitalize">{prod.category}</td>
                              <td className="py-2.5 px-3 text-right font-mono">
                                {formatCurrency(prod.unitPrice)}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono">{prod.qty}</td>
                              <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-900">
                                {formatCurrency(prod.unitPrice * prod.qty)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-50/80 font-bold text-slate-900 border-t border-slate-200">
                          <tr>
                            <td colSpan={4} className="py-3 px-4 text-right">
                              Total Order Amount:
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-sm text-brand-700">
                              {formatCurrency(item.cart.total)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  {isPending ? (
                    <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs text-slate-500">
                        {mandate.vaultId ? (<>Approving charges your saved PayPal account (<strong>{mandate.vaultId.slice(0, 16)}...</strong>).</>) : (<>No PayPal account saved yet: after approval, PayPal asks the buyer to approve the order.</>)}
                      </span>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDecision(item.id, false)}
                          disabled={actingId === item.id}
                          className="px-4 py-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <XCircle className="w-4 h-4 text-rose-600" />
                          Reject Cart
                        </button>
                        <button
                          onClick={() => handleDecision(item.id, true)}
                          disabled={actingId === item.id}
                          className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-600/20 transition-all disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Approve & Pay ({formatCurrency(item.cart.total)})
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
                      <span>Decision recorded in tamper-proof receipt log.</span>
                      <span className="font-semibold text-slate-700">
                        Status: {item.status.toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
