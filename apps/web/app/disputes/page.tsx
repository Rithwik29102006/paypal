"use client";

import React, { useState } from "react";
import { useMandate, type DisputeItem } from "@/lib/state";
import { evidencePdfUrl } from "@/lib/api";
import { categoriesSentence, disputeReason, listOf, money, when } from "@/lib/describe";
import { Seal } from "@/components/Seal";
import { cn } from "@/lib/utils";
import { Check, FileText, Scale, X } from "lucide-react";

const STAGES = ["Buyer opened a dispute", "Mandate sent its proof", "PayPal decides"] as const;

function stageIndex(d: DisputeItem): number {
  if (d.status === "won" || d.status === "lost") return 3;
  if (d.status === "evidence_submitted") return 2;
  return 1;
}

function Proof({ d }: { d: DisputeItem }) {
  const e = d.evidence;
  if (!e) return <p className="text-ink-600">The proof will appear here once Mandate sends it.</p>;
  const items = e.cart.items.map((i) => String(i.name ?? i.sku ?? "item"));
  const points = [
    {
      ok: e.mandate.signatureValid,
      title: e.mandate.signatureValid ? "Anita signed the rules herself" : "The signature on the rules did not check out",
      body: `Up to ${money(e.mandate.rules.monthlyCap)} a month on ${categoriesSentence(e.mandate.rules.allowedCategories)}, asking above ${money(e.mandate.rules.approvalAbove)}.`,
    },
    {
      ok: e.cart.decision !== "block",
      title: e.cart.decision === "allow" ? "The purchase fit those rules" : e.cart.decision === "needs_approval" ? "Anita was asked first" : "Mandate had flagged this cart",
      body: `${listOf(items.slice(0, 4))} for ${money(e.cart.total)}${e.cart.userRequest ? `, after she asked: “${e.cart.userRequest}”` : ""}.`,
    },
    ...(e.approval
      ? [{ ok: e.approval.status === "approved", title: e.approval.status === "approved" ? "Anita approved it" : "Anita did not approve it", body: e.approval.decidedAt ? when(e.approval.decidedAt) : "" }]
      : []),
    {
      ok: /captur|complete/i.test(e.payment.status),
      title: "PayPal took the payment through Mandate",
      body: `${money(e.payment.amount)}, only after the rules were checked.`,
    },
    {
      ok: e.chain.ok,
      title: e.chain.ok ? "The history is untouched" : "The history was altered",
      body: `${e.chain.checked} sealed entries checked.`,
    },
  ];
  return (
    <ul className="space-y-3">
      {points.map((p) => (
        <li key={p.title} className="flex gap-3">
          <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white", p.ok ? "bg-go" : "bg-stop")}>
            {p.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
          </span>
          <div>
            <p className="font-medium text-ink">{p.title}</p>
            {p.body && <p className="text-[0.95rem] text-ink-600">{p.body}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function DisputeCard({ d }: { d: DisputeItem }) {
  const { defendDispute, resolveDispute } = useMandate();
  const [busy, setBusy] = useState<"" | "defend" | "rule">("");
  const [showProof, setShowProof] = useState(false);
  const stage = stageIndex(d);
  const done = d.status === "won" || d.status === "lost";

  const run = async (kind: "defend" | "rule") => {
    setBusy(kind);
    if (kind === "defend") await defendDispute(d.id);
    else await resolveDispute(d.id, "won");
    setBusy("");
  };

  return (
    <article className="rounded-[24px] bg-white p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[52ch]">
          <p className="text-sm text-ink-400">Opened {when(d.createdAt)}</p>
          <h2 className="mt-1 text-[1.45rem] font-bold leading-snug">{disputeReason(d.reason)}</h2>
          {d.amount !== null && <p className="mt-1 text-ink-600">A {money(d.amount)} purchase the agent made.</p>}
        </div>
        {done && (
          <div className={cn("flex items-center gap-2 rounded-full px-4 py-2 font-semibold animate-stamp", d.status === "won" ? "bg-go-50 text-go" : "bg-stop-50 text-stop")}>
            {d.status === "won" ? <Seal size={24} /> : <X className="h-5 w-5" />}
            {d.status === "won" ? "Won. Payment stays." : "Lost. Payment refunded."}
          </div>
        )}
      </div>

      <ol className="mt-6 grid grid-cols-3 gap-2" aria-label="Dispute progress">
        {STAGES.map((s, i) => {
          const reached = i < stage;
          return (
            <li key={s}>
              <span className={cn("block h-1.5 rounded-full", reached ? (i === 2 && d.status === "lost" ? "bg-stop" : "bg-go") : "bg-line")} />
              <span className={cn("mt-2 block text-sm", reached ? "font-medium text-ink" : "text-ink-400")}>{s}</span>
            </li>
          );
        })}
      </ol>

      {d.status === "error" && d.lastError && (
        <p className="mt-5 rounded-2xl bg-stop-50 px-4 py-3 text-stop">Sending the proof failed: {d.lastError}</p>
      )}
      {d.status === "evidence_submitted" && (
        <p className="mt-5 text-ink-600">PayPal has the proof and is reviewing the case. Its decision shows up here automatically.</p>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {(d.status === "open" || d.status === "error") && (
          <button onClick={() => run("defend")} disabled={!!busy} className="btn-pp">
            <Scale className="h-4 w-4" /> {busy === "defend" ? "Sending…" : "Send proof to PayPal"}
          </button>
        )}
        {d.evidence && (
          <button onClick={() => setShowProof((s) => !s)} className="btn-ghost" aria-expanded={showProof}>
            {showProof ? "Hide the proof" : "See the proof"}
          </button>
        )}
        {d.evidence && (
          <a href={evidencePdfUrl(d.id)} target="_blank" rel="noreferrer" className="btn-ghost">
            <FileText className="h-4 w-4" /> Proof as PDF
          </a>
        )}
        {d.status === "evidence_submitted" && (
          <button onClick={() => run("rule")} disabled={!!busy} className="btn-quiet" title="PayPal sandbox only">
            {busy === "rule" ? "Asking PayPal…" : "Ask the PayPal sandbox to decide"}
          </button>
        )}
      </div>

      {showProof && (
        <div className="mt-6 rounded-[20px] bg-mist p-5 animate-rise">
          <p className="mb-4 font-display text-[1.15rem] font-semibold">What Mandate told PayPal</p>
          <Proof d={d} />
        </div>
      )}
    </article>
  );
}

export default function DisputesPage() {
  const { disputes } = useMandate();
  return (
    <div className="max-w-[860px]">
      <h1 className="text-[2.4rem] font-extrabold leading-tight">Disputes</h1>
      <p className="mt-2 max-w-[60ch] text-[1.08rem] text-ink-600">
        When a buyer tells PayPal “I never ordered this”, Mandate answers with Anita&apos;s signed rules, the check it ran and the sealed history.
      </p>
      <div className="mt-8 space-y-5">
        {disputes.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-line bg-white/60 p-8">
            <p className="text-[1.15rem] font-semibold">No disputes. Every purchase so far stands.</p>
            <p className="mt-1 text-ink-600">If a buyer opens one in PayPal, it shows up here and Mandate sends its proof automatically.</p>
          </div>
        ) : (
          disputes.map((d) => <DisputeCard key={d.id} d={d} />)
        )}
      </div>
    </div>
  );
}
