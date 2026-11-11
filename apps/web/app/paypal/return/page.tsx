"use client";

/**
 * PayPal sends the buyer back here in two cases:
 *   ?mandateId=...  after approving "save my PayPal account" (vault setup):
 *                   finish the vault, which re-signs the mandate.
 *   ?cartId=...     after approving a single order (no saved account yet):
 *                   POST /pay again, which captures the approved order.
 * PayPal adds its own params (token, PayerID); we ignore them.
 */
import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { completeVault, payCart } from "@/lib/api";
import { useMandate } from "@/lib/state";

function ReturnInner() {
  const params = useSearchParams();
  const mandateId = params.get("mandateId");
  const cartId = params.get("cartId");
  const { setMandateId, refresh, clearPaypalApproval } = useMandate();
  const [state, setState] = useState<{ status: "working" | "done" | "error"; message: string; title?: string }>({
    status: "working",
    message: cartId ? "Capturing your approved PayPal payment..." : "Saving your PayPal account for this mandate...",
  });

  useEffect(() => {
    let cancelled = false;
    if (cartId) {
      payCart(cartId)
        .then((p) => {
          if (cancelled) return;
          clearPaypalApproval();
          setState(
            p.status === "captured"
              ? { status: "done", title: "Payment captured", message: `PayPal order ${p.paypalOrderId} captured (capture ${p.captureId}). It is now in the receipt chain.` }
              : { status: "error", message: `PayPal order ${p.paypalOrderId} is ${p.status}. Approve it in PayPal first.` }
          );
          refresh();
        })
        .catch((err: Error) => !cancelled && setState({ status: "error", message: err.message }));
    } else if (mandateId) {
      completeVault(mandateId)
        .then((m) => {
          if (cancelled) return;
          setMandateId(m.id);
          setState({ status: "done", title: "PayPal connected", message: `PayPal saved. Mandate ${m.id} can now pay without asking you each time (within its rules).` });
          refresh();
        })
        .catch((err: Error) => !cancelled && setState({ status: "error", message: err.message }));
    } else {
      setState({ status: "error", message: "Missing mandateId or cartId in the return URL." });
    }
    return () => {
      cancelled = true;
    };
  }, [mandateId, cartId, setMandateId, refresh, clearPaypalApproval]);

  return (
    <div className="max-w-xl mx-auto mt-10 bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-4 text-sm">
      <div className="flex items-center gap-2">
        {state.status === "working" && <Loader2 className="w-5 h-5 animate-spin text-brand-600" />}
        {state.status === "done" && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
        {state.status === "error" && <AlertTriangle className="w-5 h-5 text-rose-600" />}
        <h1 className="font-bold text-slate-900 text-lg">
          {state.status === "done" ? state.title : state.status === "error" ? "Could not finish with PayPal" : "Talking to PayPal"}
        </h1>
      </div>
      <p className="text-slate-600">{state.message}</p>
      <div className="flex gap-2 pt-2">
        <Link href="/" className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold">Go to dashboard</Link>
        <Link href="/mandate" className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold">View mandate</Link>
      </div>
    </div>
  );
}

export default function PayPalReturnPage() {
  return (
    <Suspense fallback={null}>
      <ReturnInner />
    </Suspense>
  );
}
