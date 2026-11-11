"use client";

import React, { useState } from "react";
import { useMandate } from "@/lib/state";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Bot,
  Send,
  Sparkles,
  ShoppingBag,
  ShieldCheck,
  ShieldAlert,
  Clock,
  ArrowRight,
  ExternalLink,
  Search,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

export default function AgentConsolePage() {
  const { runAgentRequest, agentRunning, agentHistory, mandate, paypalApproval } = useMandate();
  const [inputPrompt, setInputPrompt] = useState("");

  const samplePrompts = [
    {
      title: "Normal Grocery & School Buy",
      prompt: "Buy notebooks and milk for this week",
      tag: "Allowed ($10.47)",
      tagClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    {
      title: "Attack: Poisoned Bundle Page",
      prompt: "Buy the back-to-school bundle from the demo store",
      tag: "Blocked (Attack)",
      tagClass: "bg-rose-50 text-rose-700 border-rose-200",
    },
    {
      title: "High-Value School Supplies",
      prompt: "Buy a backpack and scientific calculator for school",
      tag: "Needs Approval ($62+)",
      tagClass: "bg-amber-50 text-amber-700 border-amber-200",
    },
    {
      title: "Prohibited Category",
      prompt: "Buy $100 gift cards for family gifts",
      tag: "Blocked (Category)",
      tagClass: "bg-rose-50 text-rose-700 border-rose-200",
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim() || agentRunning) return;
    runAgentRequest(inputPrompt.trim());
    setInputPrompt("");
  };

  const handleSelectSample = (prompt: string) => {
    if (agentRunning) return;
    runAgentRequest(prompt);
  };

  return (
    <div className="max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              AI Shopping Agent Console
            </h1>
            <p className="text-xs text-slate-500">
              Type what your family needs. The agent shops under mandate ID:{" "}
              <strong className="font-mono text-slate-700">{mandate.id}</strong>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Rules Engine Guarded</span>
        </div>
      </div>

      {/* Quick Prompt Suggestions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {samplePrompts.map((s, idx) => (
          <button
            key={idx}
            onClick={() => handleSelectSample(s.prompt)}
            disabled={agentRunning}
            className="p-3.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-left shadow-sm transition-all hover:border-brand-300 group disabled:opacity-50"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-xs text-slate-800 group-hover:text-brand-600 transition-colors">
                {s.title}
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${s.tagClass}`}>
                {s.tag}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 line-clamp-2">"{s.prompt}"</p>
          </button>
        ))}
      </div>

      {/* Main Console Box */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
        {/* Messages Feed */}
        <div className="flex-1 p-6 space-y-6 overflow-y-auto max-h-[600px]">
          {agentHistory.length === 0 ? (
            <div className="text-center py-16 text-slate-400 space-y-2">
              <Bot className="w-12 h-12 mx-auto stroke-1 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">The agent is ready to shop.</p>
              <p className="text-xs text-slate-400">
                Type an order above or click one of the pre-built hackathon demo scenarios.
              </p>
            </div>
          ) : (
            agentHistory.map((item, idx) => (
              <div key={idx} className="space-y-4">
                {/* User Prompt Bubble */}
                <div className="flex justify-end">
                  <div className="max-w-xl bg-slate-900 text-white p-4 rounded-2xl rounded-tr-none text-xs sm:text-sm font-medium shadow-sm">
                    <p>{item.request}</p>
                    <span className="text-[10px] text-slate-400 block mt-1 text-right">
                      {formatDate(item.timestamp)}
                    </span>
                  </div>
                </div>

                {/* Agent Response Card */}
                <div className="flex gap-3 max-w-2xl">
                  <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-none p-4 text-xs sm:text-sm text-slate-800 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                      <span className="font-bold text-xs text-slate-700 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-brand-500" />
                        Agent Reasoning & Mandate Outcome
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        claude-sonnet-5-5
                      </span>
                    </div>

                    <p className="leading-relaxed text-slate-700 font-sans">{item.response}</p>

                    {/* Safety Badge */}
                    <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-200/60">
                      <span className="flex items-center gap-1 text-emerald-700 font-medium">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Validated by Mandate /check
                      </span>
                      <span className="text-slate-400">PayPal credentials withheld</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}

          {/* Running State Spinner */}
          {agentRunning && (
            <div className="flex gap-3 max-w-xl">
              <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0 animate-pulse">
                <Bot className="w-4 h-4" />
              </div>
              <div className="flex-1 bg-brand-50/60 border border-brand-100 rounded-2xl rounded-tl-none p-4 text-xs text-brand-900 flex items-center gap-3">
                <RefreshCw className="w-4 h-4 text-brand-600 animate-spin" />
                <div>
                  <p className="font-semibold text-xs">Agent searching store & inspecting pages...</p>
                  <p className="text-[11px] text-brand-700/80">
                    Applying Vercel AI SDK loop, trick detector, and POST /check rules
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/60">
          {paypalApproval && (
            <div className="mb-3 p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs flex items-center justify-between gap-3">
              <span>{paypalApproval.summary}. After you approve, PayPal brings you back here and the payment is captured.</span>
              <a
                href={paypalApproval.url}
                className="flex-shrink-0 px-3 py-2 bg-[#0070ba] hover:bg-[#005ea6] text-white rounded-lg font-bold"
              >
                Approve in PayPal
              </a>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. Buy milk, bread, and spiral notebooks for school..."
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              disabled={agentRunning}
              className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
            />
            <button
              type="submit"
              disabled={!inputPrompt.trim() || agentRunning}
              className="px-5 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-brand-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>Ask Agent</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
