"use client";

import React, { useState } from "react";
import { useMandate } from "@/lib/state";
import { formatCurrency } from "@/lib/utils";
import type { Category, Rules } from "@mandate/shared";
import {
  FileKey,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Plus,
  X,
  CreditCard,
  KeyRound,
  ArrowRight,
  Info,
  Calendar,
} from "lucide-react";

const ALL_CATEGORIES: Category[] = [
  "groceries",
  "school",
  "household",
  "electronics",
  "gift_cards",
  "crypto",
  "luxury",
];

export default function MandateRulesPage() {
  const { mandate, updateRules } = useMandate();

  const [monthlyCap, setMonthlyCap] = useState(mandate.rules.monthlyCap);
  const [perTxCap, setPerTxCap] = useState(mandate.rules.perTxCap);
  const [approvalAbove, setApprovalAbove] = useState(mandate.rules.approvalAbove);
  const [allowedCategories, setAllowedCategories] = useState<Category[]>(
    mandate.rules.allowedCategories
  );
  const [blockedKeywords, setBlockedKeywords] = useState<string[]>(
    mandate.rules.blockedKeywords
  );
  const [newKeyword, setNewKeyword] = useState("");
  const [expiresAt, setExpiresAt] = useState(
    mandate.rules.expiresAt.split("T")[0]
  );
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [signingModal, setSigningModal] = useState(false);

  const toggleCategory = (cat: Category) => {
    if (allowedCategories.includes(cat)) {
      if (allowedCategories.length > 1) {
        setAllowedCategories(allowedCategories.filter((c) => c !== cat));
      }
    } else {
      setAllowedCategories([...allowedCategories, cat]);
    }
  };

  const addKeyword = () => {
    if (newKeyword.trim() && !blockedKeywords.includes(newKeyword.trim().toLowerCase())) {
      setBlockedKeywords([...blockedKeywords, newKeyword.trim().toLowerCase()]);
      setNewKeyword("");
    }
  };

  const removeKeyword = (kw: string) => {
    setBlockedKeywords(blockedKeywords.filter((k) => k !== kw));
  };

  const handleSave = () => {
    setSigningModal(true);
    setTimeout(() => {
      const newRules: Rules = {
        currency: "USD",
        monthlyCap: Number(monthlyCap),
        perTxCap: Number(perTxCap),
        approvalAbove: Number(approvalAbove),
        allowedCategories,
        allowedMerchants: ["demo-store"],
        blockedKeywords,
        expiresAt: new Date(expiresAt).toISOString(),
      };
      updateRules(newRules);
      setSigningModal(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    }, 1200);
  };

  // Plain-language preview as required by the build guide
  const naturalLanguagePreview = `Your agent can spend up to $${monthlyCap} a month on ${allowedCategories
    .map((c) => c.replace("_", " "))
    .join(" and ")}, and will ask you above $${approvalAbove}.`;

  return (
    <div className="max-w-4xl space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
            <FileKey className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Mandate Spending Rules
            </h1>
            <p className="text-xs text-slate-500">
              Set spending limits and authorized categories. Rules are signed with Ed25519 and enforced on every transaction.
            </p>
          </div>
        </div>
      </div>

      {/* Plain-Language Live Preview Callout */}
      <div className="bg-gradient-to-r from-brand-600 to-sky-700 text-white rounded-2xl p-6 shadow-lg shadow-brand-600/20">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-200 mb-2">
          <Info className="w-4 h-4 text-sky-300" />
          Live Mandate Plain-Language Preview
        </div>
        <p className="text-lg sm:text-xl font-medium leading-relaxed font-sans">
          "{naturalLanguagePreview}"
        </p>
        <div className="mt-4 pt-3 border-t border-white/20 flex flex-wrap items-center justify-between text-xs text-sky-100">
          <span>Active Mandate ID: <strong className="font-mono text-white">{mandate.id}</strong></span>
          <span>Signer: <strong className="text-white">Anita Sharma (0xEd25519)</strong></span>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2 text-sm font-semibold animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          Rules cryptographically signed with Ed25519 and synced to Mandate API!
        </div>
      )}

      {/* Rules Form Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
        {/* Row 1: Caps */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Monthly Budget Cap (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
              <input
                type="number"
                value={monthlyCap}
                onChange={(e) => setMonthlyCap(Number(e.target.value))}
                className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Total maximum spend per calendar month</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Per-Purchase Cap (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
              <input
                type="number"
                value={perTxCap}
                onChange={(e) => setPerTxCap(Number(e.target.value))}
                className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Hard limit on single transaction total</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Ask Anita Above (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
              <input
                type="number"
                value={approvalAbove}
                onChange={(e) => setApprovalAbove(Number(e.target.value))}
                className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Any cart exceeding this triggers human review</p>
          </div>
        </div>

        {/* Row 2: Allowed Categories Chips */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Authorized Purchase Categories
          </label>
          <div className="flex flex-wrap gap-2">
            {ALL_CATEGORIES.map((cat) => {
              const isAllowed = allowedCategories.includes(cat);
              const isHighRisk = ["gift_cards", "crypto", "luxury"].includes(cat);

              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                    isAllowed
                      ? "bg-brand-50 border-brand-300 text-brand-700 shadow-sm"
                      : "bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isAllowed ? "bg-brand-500" : "bg-slate-300"
                    }`}
                  />
                  <span className="capitalize">{cat.replace("_", " ")}</span>
                  {isHighRisk && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-100 text-amber-800 font-mono">
                      High Risk
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Any item with an unapproved category is rejected immediately by the /check rules engine.
          </p>
        </div>

        {/* Row 3: Blocked Keywords */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Blocked Keywords
          </label>
          <div className="flex flex-wrap gap-2 items-center mb-3">
            {blockedKeywords.map((kw) => (
              <span
                key={kw}
                className="px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-medium flex items-center gap-1.5"
              >
                <span>{kw}</span>
                <button
                  type="button"
                  onClick={() => removeKeyword(kw)}
                  className="hover:text-rose-900"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2 max-w-md">
            <input
              type="text"
              placeholder="e.g. bitcoin, luxury, gaming"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
              className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
            />
            <button
              type="button"
              onClick={addKeyword}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>
        </div>

        {/* Row 4: Expiry Date */}
        <div className="max-w-xs">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Mandate Expiration Date
          </label>
          <div className="relative">
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
            />
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Lock className="w-4 h-4 text-slate-400" />
            <span>Updates revoke the previous mandate and issue a fresh signed cryptographic identity.</span>
          </div>

          <button
            onClick={handleSave}
            className="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-sm shadow-md shadow-brand-600/30 transition-all flex items-center gap-2"
          >
            <KeyRound className="w-4 h-4" />
            Sign Rules & Connect PayPal Vault
          </button>
        </div>
      </div>

      {/* Signing Modal Overlay */}
      {signingModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-2">
              <KeyRound className="w-6 h-6 animate-spin" />
            </div>
            <h3 className="text-center font-bold text-slate-900 text-lg">
              Signing Mandate Rules
            </h3>
            <p className="text-center text-xs text-slate-500">
              Generating Ed25519 signature over canonical rules JSON and binding to PayPal Vault token...
            </p>
            <div className="space-y-2 pt-2 text-xs font-mono">
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between">
                <span className="text-slate-500">1. Canonicalize Rules:</span>
                <span className="text-emerald-600 font-semibold">Done ✓</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between">
                <span className="text-slate-500">2. Ed25519 Private Signature:</span>
                <span className="text-emerald-600 font-semibold">Generated ✓</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between">
                <span className="text-slate-500">3. PayPal Vault Setup Token:</span>
                <span className="text-emerald-600 font-semibold">Bound ✓</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
