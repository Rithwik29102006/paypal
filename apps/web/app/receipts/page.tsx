"use client";

import React from "react";
import { useMandate } from "@/lib/state";
import { dayLabel, describeReceipt, type Tone } from "@/lib/describe";
import type { Receipt } from "@/lib/receipts";
import { cn } from "@/lib/utils";
import { ShieldCheck, ShieldAlert, Check, X, Hourglass, PenLine } from "lucide-react";

const DOT: Record<Tone, string> = {
  go: "bg-go text-white",
  ask: "bg-ask text-white",
  stop: "bg-stop text-white",
  info: "bg-navy text-white",
};

function Icon({ tone }: { tone: Tone }) {
  const c = "h-3.5 w-3.5";
  if (tone === "go") return <Check className={c} />;
  if (tone === "stop") return <X className={c} />;
  if (tone === "ask") return <Hourglass className={c} />;
  return <PenLine className={c} />;
}

function groupByDay(receipts: Receipt[]) {
  const groups: { day: string; items: Receipt[] }[] = [];
  [...receipts]
    .sort((a, b) => b.seq - a.seq)
    .forEach((r) => {
      const day = dayLabel(r.createdAt);
      const g = groups[groups.length - 1];
      if (g && g.day === day) g.items.push(r);
      else groups.push({ day, items: [r] });
    });
  return groups;
}

export default function ActivityPage() {
  const { receipts, verifyChain, verificationResult, isVerifying } = useMandate();
  const groups = groupByDay(receipts);
  const broken = verificationResult && !verificationResult.valid ? verificationResult.brokenSeq : undefined;

  return (
    <div className="max-w-[820px]">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-[2.4rem] font-extrabold leading-tight">Everything the agent did</h1>
          <p className="mt-2 max-w-[56ch] text-[1.08rem] text-ink-600">
            Each entry is sealed to the one before it, so nobody can quietly change history. This is the proof Mandate hands PayPal in a dispute.
          </p>
        </div>
        <button onClick={() => verifyChain()} disabled={isVerifying || receipts.length === 0} className="btn-pp">
          <ShieldCheck className="h-4 w-4" />
          {isVerifying ? "Checking…" : "Check nothing was changed"}
        </button>
      </div>

      {verificationResult && (
        <div
          role="status"
          className={cn(
            "mt-6 flex items-start gap-3 rounded-[20px] px-5 py-4 animate-rise",
            verificationResult.valid ? "bg-go-50 text-go" : "bg-stop-50 text-stop"
          )}
        >
          {verificationResult.valid ? <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /> : <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />}
          <p className="text-[1.05rem]">
            {verificationResult.valid ? (
              <>
                <strong className="font-semibold">All {verificationResult.checkedCount} entries are untouched.</strong> The history is exactly as it was written.
              </>
            ) : (
              <>
                <strong className="font-semibold">Someone changed this history.</strong> An entry was edited after it was written; it is marked below.
              </>
            )}
          </p>
        </div>
      )}

      <div className="mt-10">
        {groups.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-line bg-white/60 p-8">
            <p className="text-[1.15rem] font-semibold">Nothing has happened yet.</p>
            <p className="mt-1 text-ink-600">When the agent shops, every check, approval and PayPal payment is written here.</p>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.day} className="mb-10" aria-label={g.day}>
              <h2 className="mb-4 text-[1.2rem] font-bold">{g.day}</h2>
              <ol className="relative space-y-1 before:absolute before:bottom-3 before:left-[15px] before:top-3 before:w-0.5 before:bg-line">
                {g.items.map((r) => {
                  const line = describeReceipt(r);
                  const changed = r.tampered || broken === r.seq;
                  const tone: Tone = changed ? "stop" : line.tone;
                  return (
                    <li key={r.seq} className={cn("relative flex gap-4 rounded-2xl py-3 pr-3", changed && "bg-stop-50")}>
                      <span className={cn("relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-mist", DOT[tone])}>
                        <Icon tone={tone} />
                      </span>
                      <div className="min-w-0 pt-1">
                        <p className="font-medium text-ink">{changed ? "This entry was changed after it was written" : line.title}</p>
                        {!changed && line.detail && <p className="mt-0.5 text-[0.95rem] text-ink-600">{line.detail}</p>}
                        <p className="mt-0.5 text-sm text-ink-400">
                          {new Date(r.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
