"use client";

/**
 * PayPal sends the buyer back here in two cases:
 *   ?mandateId=...  after approving "save my PayPal account" (vault setup):
 *                   finish the vault, which re-signs the mandate.
 *   ?cartId=...     after approving a single order (no saved account yet):
 *                   POST /pay again, which captures the approved order.
 * PayPal adds its own params (token, PayerID); we ignore them.
 */
import React, { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Seal } from "@/components/Seal";
import { useSearchParams } from "next/navigation";
import { refundCart } from "@/lib/api";
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
    message: cartId ? "Confirming your payment with PayPal…" : "Saving your PayPal account…",
  });

  // Run exactly once per visit: the dashboard re-renders often, and paying or saving twice is wrong.
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const cancelled = false;
    if (cartId) {
      payCart(cartId)
        .then((p) => {
          if (cancelled) return;
          clearPaypalApproval();
          setState(
            p.status === "captured"
              ? { status: "done", title: "Paid with PayPal", message: "The payment went through and a sealed receipt was added to Activity." }
              : { status: "error", message: "PayPal hasn't confirmed this order yet. Approve it in PayPal, then come back." }
          );
          refresh();
        })
        .catch((err: Error) => !cancelled && setState({ status: "error", message: err.message }));
    } else if (mandateId) {
      completeVault(mandateId)
        .then((m) => {
          if (cancelled) return;
          setMandateId(m.id);
          setState({ status: "done", title: "PayPal account saved", message: "The agent can now pay within Anita's rules without a PayPal pop-up every time." });
          refresh();
        })
        .catch((err: Error) => !cancelled && setState({ status: "error", message: err.message }));
    } else {
      setState({ status: "error", message: "This page is reached from PayPal after approving an order. Start from the agent instead." });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mandateId, cartId]);

  return (
    <div className="mx-auto mt-6 max-w-[560px] rounded-[26px] bg-white p-8 text-center sm:p-10">
      <div className="mx-auto flex h-16 w-16 items-center justify-center">
        {state.status === "working" && <Loader2 className="h-10 w-10 animate-spin text-pp" />}
        {state.status === "done" && <Seal size={64} className="animate-stamp" />}
        {state.status === "error" && <AlertTriangle className="h-10 w-10 text-stop" />}
      </div>
      <h1 className="mt-5 text-[2rem] font-extrabold leading-tight">
        {state.status === "done" ? state.title : state.status === "error" ? "PayPal didn't finish" : "Talking to PayPal"}
      </h1>
      <p className="mx-auto mt-3 max-w-[42ch] text-[1.05rem] text-ink-600">{state.message}</p>
      {cartId && state.status === "done" && state.title === "Paid with PayPal" && <ReturnUndo cartId={cartId} />}
      <div className="mt-7 flex justify-center gap-2">
        <Link href="/" className="btn-pp">Back to the agent</Link>
        <Link href="/receipts" className="btn-ghost">See activity</Link>
      </div>
    </div>
  );
}

/** Same 60-second undo as in the chat, for purchases finished here after PayPal approval. */
function ReturnUndo({ cartId }: { cartId: string }) {
  const [left, setLeft] = useState(60);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (left <= 0 || state === "done") return;
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left, state]);
  if (state === "done") return <p className="mt-5 font-semibold text-ask">Undone. PayPal refunded the payment.</p>;
  if (left <= 0) return null;
  return (
    <div className="mt-5">
      <button
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          try {
            await refundCart(cartId);
            setState("done");
          } catch (e) {
            setMsg((e as Error).message);
            setState("error");
          }
        }}
        className="rounded-full border border-go/40 px-5 py-2 font-semibold text-go hover:bg-go hover:text-white"
      >
        {state === "busy" ? "Refunding…" : `Changed your mind? Undo (${left}s)`}
      </button>
      {state === "error" && <p className="mt-2 text-sm text-stop">{msg}</p>}
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
