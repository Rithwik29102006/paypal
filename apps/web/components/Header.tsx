"use client";

import React from "react";
import { useMandate } from "@/lib/state";
import { formatCurrency } from "@/lib/utils";
import { ShieldCheck, PlayCircle, Lock, ShieldAlert, CheckCircle2 } from "lucide-react";

export function Header() {
  const { mandate, runAgentRequest, agentRunning } = useMandate();
  const spendPct = Math.min(100, Math.round((mandate.spentThisMonth / mandate.rules.monthlyCap) * 100));

  const triggerStory = (scene: number) => {
    if (agentRunning) return;
    if (scene === 1) {
      runAgentRequest("Buy notebooks and milk for this week");
    } else if (scene === 2) {
      runAgentRequest("Buy the back-to-school bundle from the demo store");
    } else if (scene === 3) {
      runAgentRequest("Buy a backpack and calculator for school");
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
      <div className="px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Left: Project Pitch */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand-50 rounded-lg text-brand-600 border border-brand-100 hidden sm:block">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-slate-800">
                Mandate Spending Guardrails
              </h1>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Rules Signed & Active
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden md:block">
              AI agents shop for you — PayPal only moves money if certified by your rules
            </p>
          </div>
        </div>

        {/* Right: Spend Meter & Quick Demo Actions */}
        <div className="flex items-center gap-4 ml-auto">
          {/* Quick Demo Trigger Pills */}
          <div className="hidden lg:flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <span className="px-2 font-semibold text-slate-500 text-[11px]">Demo:</span>
            <button
              onClick={() => triggerStory(1)}
              disabled={agentRunning}
              className="px-2.5 py-1 bg-white hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 rounded-lg font-medium shadow-sm border border-slate-200 transition-colors flex items-center gap-1.5 text-xs disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              1. Normal Buy
            </button>
            <button
              onClick={() => triggerStory(2)}
              disabled={agentRunning}
              className="px-2.5 py-1 bg-white hover:bg-rose-50 hover:text-rose-700 text-slate-700 rounded-lg font-medium shadow-sm border border-slate-200 transition-colors flex items-center gap-1.5 text-xs disabled:opacity-50"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
              2. Attack Block
            </button>
            <button
              onClick={() => triggerStory(3)}
              disabled={agentRunning}
              className="px-2.5 py-1 bg-white hover:bg-amber-50 hover:text-amber-700 text-slate-700 rounded-lg font-medium shadow-sm border border-slate-200 transition-colors flex items-center gap-1.5 text-xs disabled:opacity-50"
            >
              <PlayCircle className="w-3.5 h-3.5 text-amber-600" />
              3. Needs Approval
            </button>
          </div>

          {/* Spend Meter Widget */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-1.5 min-w-[200px]">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-500 font-medium">Monthly Spend</span>
              <span className="font-semibold text-slate-800 font-mono">
                {formatCurrency(mandate.spentThisMonth)} / {formatCurrency(mandate.rules.monthlyCap)}
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  spendPct > 90
                    ? "bg-rose-500"
                    : spendPct > 70
                    ? "bg-amber-500"
                    : "bg-brand-500"
                }`}
                style={{ width: `${spendPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
