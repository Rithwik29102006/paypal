"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMandate, type AgentRun } from "@/lib/state";
import { humanReason, listOf, money, when } from "@/lib/describe";
import { AgentOrb } from "@/components/AgentOrb";
import { AgentText } from "@/components/AgentText";
import { HandoffRail } from "@/components/HandoffRail";
import { cn } from "@/lib/utils";
import { ChevronDown, ShieldX, MessageCircleQuestion, TriangleAlert } from "lucide-react";
import { explainRun, refundCart } from "@/lib/api";
import { useEffect } from "react";

const UNDO_SECONDS = 60;

/** Anita's 60-second undo: PayPal refunds the payment in full. */
function UndoButton({ run }: { run: AgentRun }) {
  const { refresh } = useMandate();
  const deadline = new Date(run.timestamp).getTime() + UNDO_SECONDS * 1000;
  const [left, setLeft] = useState(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (left <= 0 || state === "done") return;
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  }, [deadline, left, state]);
  if (!run.cartId) return null;
  if (state === "done") return <span className="font-semibold text-ask">Undone. PayPal refunded it.</span>;
  if (left <= 0) return null;
  const undo = async () => {
    setState("busy");
    try {
      await refundCart(run.cartId!);
      setState("done");
      refresh();
    } catch (e) {
      setMsg((e as Error).message);
      setState("error");
    }
  };
  return (
    <span className="inline-flex items-center gap-3">
      <button onClick={undo} disabled={state === "busy"} className="relative overflow-hidden rounded-full border border-go/40 bg-white px-4 py-1.5 text-sm font-semibold text-go hover:bg-go hover:text-white">
        <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-go/10" style={{ width: `${(left / UNDO_SECONDS) * 100}%` }} />
        <span className="relative">{state === "busy" ? "Refunding…" : `Undo (${left}s)`}</span>
      </button>
      {state === "error" && <span className="text-sm text-stop">{msg}</span>}
    </span>
  );
}

const KNOWN_SELLERS = ["demo-store"];

/** Edit distance, to spot look-alike seller names such as "dem0-store". */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Shows a seller the agent passed over because its name imitates a real one. */
function LookalikeCard({ text }: { text: string }) {
  const found = new Set<string>();
  for (const m of text.matchAll(/\b[a-z0-9]+(?:-[a-z0-9]+)+\b/gi)) {
    const name = m[0].toLowerCase();
    if (KNOWN_SELLERS.some((k) => k !== name && distance(k, name) <= 2)) found.add(name);
  }
  if (!found.size) return null;
  const fake = [...found][0];
  const real = KNOWN_SELLERS.reduce((best, k) => (distance(k, fake) < distance(best, fake) ? k : best));
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-ask/30 bg-ask-50 px-4 py-3">
      <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-ask" />
      <div>
        <p className="font-semibold text-ink">Look-alike seller avoided</p>
        <p className="mt-1 font-mono text-[1.05rem]">
          <span className="text-go">{real}</span>
          <span className="mx-2 text-ink-400">vs</span>
          {fake.split("").map((ch, i) => (
            <span key={i} className={ch !== real[i] ? "rounded bg-stop px-0.5 text-white" : "text-stop"}>
              {ch}
            </span>
          ))}
        </p>
        <p className="mt-1 text-sm text-ink-600">One character differs. The agent bought from the real seller.</p>
      </div>
    </div>
  );
}

/** "Why did you do that?": the agent explains its choice in one sentence. */
function WhyButton({ run }: { run: AgentRun }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [text, setText] = useState("");
  const ask = async () => {
    setState("busy");
    try {
      const r = await explainRun(run.request, run.response, run.steps);
      setText(r.text);
      setState("done");
    } catch (e) {
      setText((e as Error).message);
      setState("error");
    }
  };
  if (state === "done")
    return (
      <p className="flex gap-2 rounded-2xl bg-pp-50 px-4 py-3 text-navy animate-rise">
        <MessageCircleQuestion className="mt-0.5 h-5 w-5 shrink-0" />
        <span>{text}</span>
      </p>
    );
  return (
    <button onClick={ask} disabled={state === "busy"} className="btn-quiet -ml-3">
      <MessageCircleQuestion className="h-4 w-4" />
      {state === "busy" ? "Thinking…" : state === "error" ? `Couldn't explain: ${text}` : "Why did you do that?"}
    </button>
  );
}

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
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-go-50 px-4 py-3 text-go">
          <p>
            <strong className="font-semibold">Paid with PayPal.</strong> A receipt was added to Activity.
          </p>
          {isLatest && <UndoButton run={run} />}
        </div>
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
          <strong className="font-semibold">The agent couldn&apos;t finish.</strong> {run.response || "Check that the agent and Mandate are running, then try again."}
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
          {run.outcome !== "error" && <LookalikeCard text={run.response} />}
          <div className="flex flex-wrap items-center gap-x-4">
            <Steps steps={run.steps} />
            {run.outcome !== "error" && <WhyButton run={run} />}
          </div>
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

