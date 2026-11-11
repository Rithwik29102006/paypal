"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMandate, type PendingApproval } from "@/lib/state";
import { humanReason, listOf, money, when } from "@/lib/describe";
import { AgentOrb } from "@/components/AgentOrb";
import { cn } from "@/lib/utils";

function Request({ a }: { a: PendingApproval }) {
  const { resolveApproval } = useMandate();
  const [busy, setBusy] = useState(false);
  const decide = async (ok: boolean) => {
    setBusy(true);
    await resolveApproval(a.id, ok);
    setBusy(false);
  };
  const names = a.cart.items.map((i) => (i.qty > 1 ? `${i.qty} × ${i.name}` : i.name));
  const pending = a.status === "pending";

  return (
    <article className={cn("rounded-[22px] bg-white p-6", pending ? "border-2 border-ask/40" : "border border-line")}>
      <div className="flex items-start gap-4">
        <AgentOrb size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-400">{when(a.createdAt)}</p>
          <h2 className="mt-0.5 text-[1.35rem] font-bold leading-snug">
            {pending ? "May I buy " : a.status === "approved" ? "Anita approved " : "Anita declined "}
            {listOf(names) || "this cart"}
            {a.cart.total ? ` for ${money(a.cart.total)}` : ""}
            {pending ? "?" : "."}
          </h2>
          {a.reasons.length > 0 && (
            <p className="mt-2 text-ink-600">
              <span className="font-medium text-ink">Why I&apos;m asking: </span>
              {humanReason(a.reasons[0])}
            </p>
          )}
        </div>
      </div>

      {pending ? (
        <div className="mt-5 flex flex-wrap gap-2 pl-14">
          <button disabled={busy} onClick={() => decide(true)} className="btn-pp min-w-[140px]">
            Approve
          </button>
          <button disabled={busy} onClick={() => decide(false)} className="btn-ghost min-w-[140px]">
            Decline
          </button>
        </div>
      ) : (
        <p className={cn("mt-4 pl-14 font-semibold", a.status === "approved" ? "text-go" : "text-stop")}>
          {a.status === "approved" ? "Approved. The agent finishes the purchase with PayPal." : "Declined. Nothing was bought."}
        </p>
      )}
    </article>
  );
}

export default function ApprovalsPage() {
  const { approvals } = useMandate();
  const pending = approvals.filter((a) => a.status === "pending");
  const decided = approvals.filter((a) => a.status !== "pending").slice(0, 6);

  return (
    <div className="max-w-[760px]">
      <h1 className="text-[2.4rem] font-extrabold leading-tight">Waiting for you</h1>
      <p className="mt-2 max-w-[60ch] text-[1.08rem] text-ink-600">
        When a cart costs more than the ask-me amount, the agent stops and asks here before PayPal is involved.
      </p>

      <div className="mt-8 space-y-4">
        {pending.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-line bg-white/60 p-8">
            <p className="text-[1.15rem] font-semibold text-ink">Nothing needs your OK right now.</p>
            <p className="mt-1 text-ink-600">
              Ask the agent for something bigger, like a backpack and a calculator, to see a request appear here.
            </p>
            <Link href="/" className="btn-pp mt-5">
              Go to the agent
            </Link>
          </div>
        ) : (
          pending.map((a) => <Request key={a.id} a={a} />)
        )}
      </div>

      {decided.length > 0 && (
        <section className="mt-12" aria-labelledby="earlier">
          <h2 id="earlier" className="text-[1.3rem] font-bold">
            Earlier decisions
          </h2>
          <div className="mt-4 space-y-3">
            {decided.map((a) => (
              <Request key={a.id} a={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
