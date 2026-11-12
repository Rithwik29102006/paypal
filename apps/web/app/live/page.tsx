"use client";

import React from "react";
import type { LiveEventV2 } from "@mandate/shared";
import { useMandate } from "@/lib/state";
import { money, when } from "@/lib/describe";
import { cn } from "@/lib/utils";
import { Bot, ShieldCheck, ShieldX, ShieldQuestion, Undo2 } from "lucide-react";

type Stage = "checked" | "stopped" | "asking" | "waiting" | "paid" | "refunded";

interface Lane {
  cartId: string;
  who: string;
  total?: number;
  items: string;
  stage: Stage;
  at: string;
}

const OWNER: Record<string, string> = { mdt_teen: "Sam's agent" };

/** Fold the raw event stream into one lane per cart, newest first. */
function lanes(wire: LiveEventV2[]): Lane[] {
  const byCart = new Map<string, Lane>();
  for (const e of [...wire].reverse()) {
    if (!e.cartId) continue;
    const lane =
      byCart.get(e.cartId) ??
      ({ cartId: e.cartId, who: OWNER[e.mandateId ?? ""] ?? "Anita's agent", items: "", stage: "checked", at: e.at } as Lane);
    if (e.items?.length) lane.items = e.items.map((i) => i.name).slice(0, 3).join(", ");
    if (typeof e.total === "number") lane.total = e.total;
    if (e.type === "check") lane.stage = e.decision === "block" ? "stopped" : e.decision === "needs_approval" ? "asking" : "checked";
    if (e.type === "approval") lane.stage = /reject|declin/i.test(e.summary) ? "stopped" : "checked";
    if (e.type === "payment") lane.stage = /refund/i.test(e.summary) ? "refunded" : /captur/i.test(e.summary) ? "paid" : "waiting";
    lane.at = e.at;
    byCart.set(e.cartId, lane);
  }
  return [...byCart.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
}

const STAGE: Record<Stage, { col: number; label: string; tone: string }> = {
  checked: { col: 1, label: "Allowed by Mandate", tone: "bg-go" },
  asking: { col: 1, label: "Waiting for Anita", tone: "bg-ask" },
  stopped: { col: 1, label: "Stopped, no money moved", tone: "bg-stop" },
  waiting: { col: 2, label: "Waiting for PayPal approval", tone: "bg-sky" },
  paid: { col: 2, label: "Paid with PayPal", tone: "bg-go" },
  refunded: { col: 2, label: "Refunded by PayPal", tone: "bg-ask" },
};

export default function LivePage() {
  const { wire } = useMandate();
  const rows = lanes(wire);
  const carts = new Set(wire.filter((e) => e.type === "check").map((e) => e.cartId)).size;
  const stopped = wire.filter((e) => e.type === "check" && e.decision === "block").length;
  const paid = wire.filter((e) => e.type === "payment" && /captur/i.test(e.summary)).length;

  return (
    <div>
      <h1 className="text-[2.4rem] font-extrabold leading-tight">Live</h1>
      <p className="mt-2 max-w-[62ch] text-[1.08rem] text-ink-600">
        Every cart any agent sends to Mandate, as it happens. Keep this open next to the Agent tab and watch purchases move from agent to Mandate to PayPal, or stop.
      </p>

      <section className="mt-8 overflow-hidden rounded-[26px] bg-navy text-white">
        <div className="flex flex-wrap gap-x-10 gap-y-3 border-b border-white/10 px-7 py-5">
          {[
            ["carts checked", carts, "text-white"],
            ["stopped", stopped, "text-[#FF8A9B]"],
            ["paid with PayPal", paid, "text-sky"],
          ].map(([label, n, tone]) => (
            <p key={label as string} className="text-white/70">
              <span className={cn("mr-2 font-display text-[2rem] font-extrabold", tone as string)}>{n as number}</span>
              {label as string}
            </p>
          ))}
          <p className="ml-auto flex items-center gap-2 text-white/70">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-sky" />
            </span>
            Listening
          </p>
        </div>

        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-4 px-7 pt-5 text-sm text-white/60">
          <span>Purchase</span>
          <span className="flex items-center gap-1.5"><Bot className="h-4 w-4" /> Agent</span>
          <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Mandate</span>
          <span>PayPal</span>
        </div>

        {rows.length === 0 ? (
          <div className="px-7 pb-10 pt-8">
            <p className="font-display text-[1.4rem] font-semibold">Waiting for the next purchase…</p>
            <p className="mt-1 text-white/70">Open the Agent tab in another window and ask for something. It appears here the moment Mandate checks it.</p>
          </div>
        ) : (
          <ol className="space-y-2 px-4 pb-6 pt-3">
            {rows.map((r, i) => {
              const st = STAGE[r.stage];
              const Icon = r.stage === "stopped" ? ShieldX : r.stage === "asking" ? ShieldQuestion : r.stage === "refunded" ? Undo2 : ShieldCheck;
              return (
                <li key={r.cartId} className={cn("grid grid-cols-[1.4fr_1fr_1fr_1fr] items-center gap-4 rounded-2xl px-3 py-3", i === 0 && "bg-white/5 animate-rise")}>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.items || "A cart"}</p>
                    <p className="text-sm text-white/60">
                      {r.who}
                      {r.total !== undefined ? `, ${money(r.total)}` : ""}, {when(r.at)}
                    </p>
                  </div>
                  {/* the track: a line with the dot where the cart got to */}
                  <div className="relative col-span-3 h-10">
                    <div className="absolute left-[16%] right-[16%] top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/10" />
                    <div
                      className={cn("absolute left-[16%] top-1/2 h-[3px] -translate-y-1/2 rounded-full transition-all duration-700", r.stage === "stopped" ? "bg-stop/60" : "bg-go/70")}
                      style={{ width: `${st.col === 1 ? 34 : 68}%` }}
                    />
                    {[0, 1, 2].map((c) => (
                      <span key={c} className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20" style={{ left: `${16 + c * 34}%` }} />
                    ))}
                    <span
                      className={cn("absolute top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-[0_0_0_6px_rgba(255,255,255,.06)] transition-all duration-700", st.tone)}
                      style={{ left: `${16 + st.col * 34}%` }}
                      title={st.label}
                    >
                      <Icon className="h-4 w-4 text-white" />
                    </span>
                    <span className="absolute right-0 top-full -mt-1 text-xs text-white/60">{st.label}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
