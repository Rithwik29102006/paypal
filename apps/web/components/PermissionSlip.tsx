"use client";

import Link from "next/link";
import { useState } from "react";
import { useMandate } from "@/lib/state";
import { categoriesSentence, money } from "@/lib/describe";
import { Seal } from "./Seal";

function budgetWords(pct: number): string {
  if (pct < 5) return "Barely touched this month";
  if (pct < 50) return "Plenty left this month";
  if (pct < 85) return "More than half used this month";
  if (pct < 100) return "Almost used up this month";
  return "This month's budget is used up";
}

/** Anita's signed rules, presented as the permission slip the agent carries. */
export function PermissionSlip() {
  const { mandate, mandateLoaded, setPaused } = useMandate();
  const [busy, setBusy] = useState(false);
  const paused = mandate.status === "paused";
  const toggle = async () => {
    setBusy(true);
    await setPaused(!paused);
    setBusy(false);
  };
  const r = mandate.rules;
  const pct = Math.min(100, Math.round((mandate.spentThisMonth / Math.max(1, r.monthlyCap)) * 100));
  const signed = mandateLoaded && mandate.status === "active";

  return (
    <section aria-labelledby="slip-title" className="slip shadow-[0_1px_0_#D8E1EF,0_18px_40px_-28px_rgba(0,28,100,.45)]">
      <div className="flex items-start justify-between gap-4 px-6 pb-5 pt-6">
        <div>
          <p className="text-sm text-ink-400">Permission slip</p>
          <h2 id="slip-title" className="mt-0.5 text-[1.6rem] font-bold leading-tight">
            What the agent may spend
          </h2>
        </div>
        <div className={signed ? "animate-stamp" : paused ? "grayscale opacity-60" : "opacity-30"} title={signed ? "Signed by Anita" : paused ? "Paused by Anita" : "Not signed yet"}>
          <Seal size={50} />
        </div>
      </div>

      <div className="tear" />

      <ul className="space-y-3.5 px-6 py-5 text-[1.02rem] leading-snug">
        <li>Up to <strong className="font-semibold">{money(r.monthlyCap)}</strong> a month, never more than <strong className="font-semibold">{money(r.perTxCap)}</strong> at once.</li>
        <li>Only on <strong className="font-semibold">{categoriesSentence(r.allowedCategories)}</strong>.</li>
        <li>Anything above <strong className="font-semibold">{money(r.approvalAbove)}</strong> waits for Anita&apos;s OK.</li>
        <li className="text-ink-600">The agent never sees a card or a PayPal password.</li>
      </ul>

      <div className="px-6 pb-6">
        <div className="h-2 overflow-hidden rounded-full bg-mist" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Monthly budget used">
          <div className={pct >= 85 ? "h-full bg-ask" : "h-full bg-pp"} style={{ width: `${Math.max(2, pct)}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-ink-600">{budgetWords(pct)}</span>
          <Link href="/mandate" className="font-semibold text-pp hover:underline">
            Change rules
          </Link>
        </div>
      </div>

      <div className="tear" />
      <div className="px-6 py-5">
        {paused ? (
          <>
            <p className="font-semibold text-stop">Spending is paused.</p>
            <p className="mt-0.5 text-sm text-ink-600">The agent can still search, but Mandate refuses every purchase until you resume.</p>
            <button onClick={toggle} disabled={busy || !mandateLoaded} className="btn-pp mt-3 w-full">
              {busy ? "Resuming…" : "Resume spending"}
            </button>
          </>
        ) : (
          <button
            onClick={toggle}
            disabled={busy || !mandateLoaded}
            className="w-full rounded-full border-2 border-stop/30 px-5 py-2.5 font-semibold text-stop transition-colors hover:border-stop hover:bg-stop-50 disabled:opacity-50"
          >
            {busy ? "Pausing…" : "Pause all spending"}
          </button>
        )}
      </div>
    </section>
  );
}
