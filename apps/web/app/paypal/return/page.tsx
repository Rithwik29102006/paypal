"use client";

/**
 * PayPal sends Anita here after she approves saving her PayPal account
 * (vault setup token). We finish the vault on the API, which re-signs the
 * mandate with the saved payment method. PayPal may add its own query
 * params; we only read mandateId.
 */
import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { completeVault } from "@/lib/api";
import { useMandate } from "@/lib/state";

function ReturnInner() {
  const params = useSearchParams();
  const mandateId = params.get("mandateId");
  const { setMandateId, refresh } = useMandate();
  const [state, setState] = useState<{ status: "working" | "done" | "error"; message: string }>({
    status: "working",
    message: "Saving your PayPal account for this mandate...",
  });

  useEffect(() => {
    if (!mandateId) {
      setState({ status: "error", message: "Missing mandateId in the return URL." });
      return;
    }
    let cancelled = false;
    completeVault(mandateId)
      .then((m) => {
        if (cancelled) return;
        setMandateId(m.id);
        setState({ status: "done", message: `PayPal saved. Mandate ${m.id} can now pay without asking you each time (within its rules).` });
        refresh();
      })
      .catch((err: Error) => !cancelled && setState({ status: "error", message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [mandateId, setMandateId, refresh]);

  return (
    <div className="max-w-xl mx-auto mt-10 bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-4 text-sm">
      <div className="flex items-center gap-2">
        {state.status === "working" && <Loader2 className="w-5 h-5 animate-spin text-brand-600" />}
        {state.status === "done" && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
        {state.status === "error" && <AlertTriangle className="w-5 h-5 text-rose-600" />}
        <h1 className="font-bold text-slate-900 text-lg">
          {state.status === "done" ? "PayPal connected" : state.status === "error" ? "Could not finish PayPal setup" : "Connecting PayPal"}
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
