"use client";

import React from "react";
import Link from "next/link";
import { useMandate } from "@/lib/state";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  ShieldCheck,
  CreditCard,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Bot,
  Zap,
  Lock,
  FileCheck2,
  Scale,
} from "lucide-react";

export default function DashboardPage() {
  const { mandate, approvals, receipts, events, disputes } = useMandate();
  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const openDisputes = disputes.filter((d) => d.status === "open");

  const spendPct = Math.min(
    100,
    Math.round((mandate.spentThisMonth / mandate.rules.monthlyCap) * 100)
  );

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-brand-900 rounded-2xl p-6 sm:p-8 text-white shadow-xl shadow-slate-900/10 border border-slate-700/60 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/20 border border-brand-400/30 text-brand-300 text-xs font-semibold mb-3">
            <ShieldCheck className="w-4 h-4 text-brand-400" />
            Active Spending Permission Slip · PayPal AI Hackathon 2026
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Hi Anita, your AI shopping agent is guarded by Mandate.
          </h2>
          <p className="mt-2 text-slate-300 text-sm sm:text-base leading-relaxed">
            The agent can search stores and propose carts, but <strong>cannot touch your money</strong>.
            Every order is verified against your signed rules before PayPal captures payment.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/agent"
              className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-semibold shadow-md shadow-brand-500/30 transition-all flex items-center gap-2"
            >
              <Bot className="w-4 h-4" />
              Open Agent Console
            </Link>
            <Link
              href="/mandate"
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
            >
              <FileCheck2 className="w-4 h-4" />
              Review Spending Rules
            </Link>
          </div>
        </div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Metric 1: Monthly Spend */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Monthly Budget Cap</span>
            <span className="font-mono text-slate-700">{spendPct}% used</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {formatCurrency(mandate.spentThisMonth)}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              of {formatCurrency(mandate.rules.monthlyCap)}
            </span>
          </div>
          <div className="mt-3 w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                spendPct > 90
                  ? "bg-rose-500"
                  : spendPct > 70
                  ? "bg-amber-500"
                  : "bg-brand-500"
              }`}
              style={{ width: `${spendPct}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Remaining balance:{" "}
            <strong className="text-emerald-600 font-semibold">
              {formatCurrency(mandate.rules.monthlyCap - mandate.spentThisMonth)}
            </strong>
          </p>
        </div>

        {/* Metric 2: Per-Purchase Limit */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Per-Purchase Limit</span>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
              Hard Ceiling
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {formatCurrency(mandate.rules.perTxCap)}
            </span>
            <span className="text-xs text-slate-400">max / order</span>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Ask Anita above:</span>
            <strong className="text-amber-600 font-semibold font-mono">
              {formatCurrency(mandate.rules.approvalAbove)}
            </strong>
          </div>
        </div>

        {/* Metric 3: Guardrail Defense Score */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Attack Defense Rate</span>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-semibold border border-emerald-200">
              Red-Team Tested
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600 font-mono">
              96.7%
            </span>
            <span className="text-xs text-slate-500 font-medium">
              (29 of 30 blocked)
            </span>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>False blocks on normal orders:</span>
            <strong className="text-emerald-600 font-semibold">0% (0 / 15)</strong>
          </div>
        </div>

        {/* Metric 4: PayPal Vault Status */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Payment Method</span>
            <span className="text-[10px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-semibold border border-brand-200">
              Vault v3
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600 font-bold text-xs">
              PP
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">PayPal Saved Account</p>
              <p className="text-[11px] text-slate-400 font-mono">vlt_paypal_***884920</p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Credentials with Agent:</span>
            <strong className="text-emerald-600 font-semibold">NONE (Zero-trust)</strong>
          </div>
        </div>
      </div>

      {/* Pending Approvals Callout Banner (if any) */}
      {pendingApprovals.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-md shadow-amber-500/20">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-900">
                {pendingApprovals.length} Purchase Held for Your Approval
              </h3>
              <p className="text-xs text-amber-700 mt-0.5">
                The AI agent requested a cart of{" "}
                <strong>{formatCurrency(pendingApprovals[0].cart.total)}</strong>. Mandate held it
                because it exceeded your ${mandate.rules.approvalAbove} threshold.
              </p>
            </div>
          </div>
          <Link
            href="/approvals"
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
          >
            Review & Decide
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Main Content: 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column (2 spans): Active Mandate Overview + Recent Transactions */}
        <div className="lg:col-span-2 space-y-8">
          {/* Active Mandate Rules Summary Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Active Mandate Details</h3>
                  <p className="text-xs text-slate-500">Cryptographically signed by user private key</p>
                </div>
              </div>
              <Link
                href="/mandate"
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
              >
                Edit Rules
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 font-medium block mb-1">Allowed Categories</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {mandate.rules.allowedCategories.map((c) => (
                    <span
                      key={c}
                      className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium capitalize"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 font-medium block mb-1">Blocked Keywords</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {mandate.rules.blockedKeywords.map((k) => (
                    <span
                      key={k}
                      className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-medium"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 font-medium block mb-1">Approved Merchants</span>
                <span className="font-semibold text-slate-700 font-mono">
                  {mandate.rules.allowedMerchants.join(", ")}
                </span>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 font-medium block mb-1">Ed25519 Signature</span>
                <span className="font-mono text-[11px] text-slate-600 truncate block">
                  {mandate.signature.slice(0, 24)}...
                </span>
              </div>
            </div>
          </div>

          {/* Recent Orders & Purchases */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Recent Check & Pay Decisions</h3>
                <p className="text-xs text-slate-500">Every decision recorded in tamper-evident log</p>
              </div>
              <Link
                href="/receipts"
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
              >
                View Hash Chain
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-slate-100 mt-2">
              {receipts
                .filter((r) => r.type === "check" || r.type === "payment")
                .slice(-5)
                .reverse()
                .map((r) => {
                  const isCheck = r.type === "check";
                  const decision = r.payload.decision;
                  const isPayment = r.type === "payment";

                  return (
                    <div key={r.seq} className="py-3.5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        {isPayment ? (
                          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        ) : decision === "block" ? (
                          <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                            <XCircle className="w-4 h-4" />
                          </div>
                        ) : decision === "needs_approval" ? (
                          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                            <Clock className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800">
                              {isPayment
                                ? `Captured PayPal Order ${r.payload.paypalOrderId}`
                                : `Cart Check: ${decision.toUpperCase()}`}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              seq #{r.seq}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {isPayment
                              ? `Capture ID: ${r.payload.captureId}`
                              : r.payload.reasons?.[0] || "Checked against mandate rules"}
                          </p>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className="text-sm font-bold font-mono text-slate-900 block">
                          {formatCurrency(r.payload.amount || r.payload.total || 0)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {formatDate(r.createdAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Right Column: Live SSE Feed & Anita's Quick Actions */}
        <div className="space-y-6">
          {/* Live Activity Feed Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm flex flex-col h-[520px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="font-bold text-slate-900 text-sm">Live Activity Feed (SSE)</h3>
              </div>
              <span className="text-[10px] font-mono text-slate-400 uppercase">Realtime</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 mt-3 pr-1 text-xs">
              {events.map((e, idx) => {
                let badgeClass = "bg-slate-100 text-slate-700";
                if (e.type === "payment") badgeClass = "bg-emerald-100 text-emerald-800 border-emerald-200";
                if (e.decision === "block") badgeClass = "bg-rose-100 text-rose-800 border-rose-200";
                if (e.decision === "needs_approval") badgeClass = "bg-amber-100 text-amber-800 border-amber-200";
                if (e.type === "dispute") badgeClass = "bg-purple-100 text-purple-800 border-purple-200";

                return (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 hover:bg-slate-100/80 transition-colors rounded-xl border border-slate-100 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${badgeClass}`}
                      >
                        {e.decision || e.type}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {formatDate(e.at)}
                      </span>
                    </div>
                    <p className="text-slate-700 text-xs font-medium leading-relaxed">
                      {e.summary}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Links Card */}
          <div className="bg-gradient-to-br from-brand-50 to-sky-50 border border-brand-100 rounded-2xl p-5 text-xs text-brand-900">
            <h4 className="font-bold text-sm text-brand-950 flex items-center gap-1.5 mb-2">
              <Zap className="w-4 h-4 text-brand-600" />
              Member 3 Demo Guide
            </h4>
            <p className="text-brand-800/80 leading-relaxed">
              Use the top demo pills to showcase the 3 Anita stories for the judges:
            </p>
            <ul className="mt-2.5 space-y-1.5 text-brand-900/90 list-disc list-inside">
              <li><strong>1. Normal Buy</strong>: Agent shops notebooks & milk, auto-approved.</li>
              <li><strong>2. Attack Block</strong>: Poisoned hidden text caught by detector.</li>
              <li><strong>3. Dispute Defense</strong>: Replays receipt chain to win false claim.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
