"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMandate, type AgentRun } from "@/lib/state";
import { humanReason, listOf, money, when } from "@/lib/describe";
import { AgentOrb } from "@/components/AgentOrb";
import { AgentText } from "@/components/AgentText";
import { HandoffRail } from "@/components/HandoffRail";
import { cn } from "@/lib/utils";
import { ChevronDown, ShieldX } from "lucide-react";

/** The detector's findings for a stopped cart, read from its sealed receipt. */
function Caught({ cartId }: { cartId?: string }) {
  const { receipts } = useMandate();
  const [open, setOpen] = useState(false);
  if (!cartId) return null;
  const r = receipts.find((x) => x.type === "check" && x.payload?.cartId === cartId);
  const signals: string[] = Array.isArray(r?.payload?.signals) ? r!.payload.signals : [];
  if (!signals.length) return null;
  return (
    <div className="mt-2">
      <button onClick={() => setOpen((o) => !o)} className="text-[0.95rem] font-semibold text-stop underline-offset-2 hover:underline" aria-expanded={open}>
        {open ? "Hide what Mandate caught" : `See what Mandate caught (${signals.length})`}
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5 rounded-xl bg-white/70 p-3 animate-rise">
          {signals.slice(0, 8).map((s, i) => (
            <li key={i} className="flex gap-2 text-[0.95rem] text-ink">
              <span aria-hidden="true" className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-stop" />
              <span>{s.replace(/^LLM:\s*/, "AI check: ")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OutcomeBanner({ run, isLatest }: { run: AgentRun; isLatest: boolean }) {
  const { paypalApproval } = useMandate();
  switch (run.outcome) {
    case "paid":
      return (
        <p className="rounded-2xl bg-go-50 px-4 py-3 text-go">
          <strong className="font-semibold">Paid with PayPal.</strong> A receipt was added to Activity.
        </p>
      );
    case "awaiting_paypal":
      return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-pp-50 px-4 py-3">
          <p className="text-navy">
            <strong className="font-semibold">One step left.</strong> Approve this order in PayPal and the payment goes through.
          </p>
          {isLatest && paypalApproval ? (
            <a href={paypalApproval.url} className="btn-pp">
              Approve in PayPal
            </a>
          ) : (
            <Link href="/receipts" className="btn-ghost">
              See activity
            </Link>
          )}
        </div>
      );
    case "needs_approval":
      return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ask-50 px-4 py-3">
          <p className="text-ink">
            <strong className="font-semibold text-ask">Anita needs to OK this.</strong>{" "}
            {run.total ? `It comes to ${money(run.total)}, above the ask-me amount.` : "It is above the ask-me amount."}
          </p>
          <Link href="/approvals" className="btn-ghost">
            Review it
          </Link>
        </div>
      );
    case "blocked":
      return (
        <div className="rounded-2xl bg-stop-50 px-4 py-3 text-ink">
          <p className="flex items-center gap-2 font-semibold text-stop">
            <ShieldX className="h-4 w-4" /> Mandate stopped this purchase. No money moved.
          </p>
          {run.reasons && run.reasons.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-[0.95rem] text-ink-600">
              {run.reasons.slice(0, 3).map((r, i) => (
                <li key={i}>{humanReason(r)}</li>
              ))}
            </ul>
          )}
          <Caught cartId={run.cartId} />
        </div>
      );
    case "error":
      return (
        <p className="rounded-2xl bg-stop-50 px-4 py-3 text-stop">
          <strong className="font-semibold">The agent couldn&apos;t finish.</strong> Check that the agent and Mandate are running, then try again.
        </p>
      );
    default:
      return null;
  }
}

function Steps({ steps }: { steps: string[] }) {
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className="btn-quiet -ml-3" aria-expanded={open}>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        How the agent got here
      </button>
      {open && (
        <ol className="mt-1 space-y-2 border-l-2 border-line pl-4">
          {steps.map((s, i) => (
            <li key={i} className="relative text-[0.95rem] text-ink-600">
              <span aria-hidden="true" className="absolute -left-[21px] top-[0.55em] h-2 w-2 rounded-full bg-sky" />
              {s}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function Exchange({ run, isLatest }: { run: AgentRun; isLatest: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[22px] rounded-br-md bg-navy px-5 py-3 text-white">
          <p className="text-[1.02rem]">{run.request}</p>
        </div>
      </div>

      <article className="flex gap-3">
        <AgentOrb size={34} className="mt-1" />
        <div className="min-w-0 flex-1 space-y-4 rounded-[22px] rounded-tl-md bg-white px-5 py-4 shadow-[0_1px_0_#D8E1EF]">
          <div className="flex items-start gap-4">
            <div className="max-w-[440px] flex-1">
              <HandoffRail outcome={run.outcome} />
            </div>
            <span className="ml-auto whitespace-nowrap text-sm text-ink-400">{when(run.timestamp)}</span>
          </div>
          <OutcomeBanner run={run} isLatest={isLatest} />
          {run.outcome !== "error" && <AgentText text={run.response} />}
          <Steps steps={run.steps} />
        </div>
      </article>
    </div>
  );
}

export function Working({ steps }: { steps: string[] }) {
  return (
    <article className="flex gap-3" aria-live="polite">
      <AgentOrb size={34} busy className="mt-1" />
      <div className="flex-1 space-y-3 rounded-[22px] rounded-tl-md bg-white px-5 py-4 shadow-[0_1px_0_#D8E1EF]">
        <div className="max-w-[440px]">
          <HandoffRail running />
        </div>
        <p className="font-medium text-ink">{steps.length ? steps[steps.length - 1] : "Looking through the store…"}</p>
        {steps.length > 1 && (
          <ol className="space-y-1 text-[0.95rem] text-ink-400">
            {steps.slice(0, -1).slice(-3).map((s, i) => (
              <li key={i} className="animate-rise">{s}</li>
            ))}
          </ol>
        )}
      </div>
    </article>
  );
}

export function WaitingCard() {
  const { approvals, resolveApproval } = useMandate();
  const pending = approvals.filter((a) => a.status === "pending");
  const [busy, setBusy] = useState(false);
  if (!pending.length) return null;
  const a = pending[0];
  const names = a.cart.items.map((i) => i.name);
  const decide = async (ok: boolean) => {
    setBusy(true);
    await resolveApproval(a.id, ok);
    setBusy(false);
  };
  return (
    <section aria-labelledby="waiting-title" className="rounded-[18px] border-2 border-ask/40 bg-white p-5">
      <h2 id="waiting-title" className="text-[1.25rem] font-bold">
        Your agent is asking
      </h2>
      <p className="mt-1.5 text-ink-600">
        May it buy {listOf(names.slice(0, 3)) || "this cart"}
        {a.cart.total ? ` for ${money(a.cart.total)}` : ""}?
      </p>
      <div className="mt-4 flex gap-2">
        <button disabled={busy} onClick={() => decide(true)} className="btn-pp flex-1">
          Approve
        </button>
        <button disabled={busy} onClick={() => decide(false)} className="btn-ghost flex-1">
          Decline
        </button>
      </div>
      {pending.length > 1 && (
        <Link href="/approvals" className="mt-3 inline-block text-sm font-semibold text-pp hover:underline">
          {pending.length - 1} more waiting
        </Link>
      )}
    </section>
  );
}

