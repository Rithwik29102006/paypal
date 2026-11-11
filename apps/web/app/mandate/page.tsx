"use client";

import React, { useEffect, useState } from "react";
import { useMandate } from "@/lib/state";
import type { Category, Rules } from "@mandate/shared";
import { CATEGORY_LABEL } from "@/lib/describe";
import { Seal } from "@/components/Seal";
import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";

const ALL_CATEGORIES: Category[] = ["groceries", "school", "household", "electronics", "gift_cards", "crypto", "luxury"];

/** A dollar amount typed straight into the sentence. */
function Amount({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <span className="mx-1 inline-flex items-baseline border-b-2 border-pp px-1 text-pp">
      <span aria-hidden="true">$</span>
      <input
        aria-label={label}
        inputMode="numeric"
        value={Number.isFinite(value) ? String(value) : ""}
        onChange={(e) => onChange(Number(e.target.value.replace(/[^\d.]/g, "")) || 0)}
        className="bg-transparent font-bold text-pp focus:outline-none"
        style={{ width: `${Math.max(1, String(value).length) * 0.62 + 0.15}em` }}
      />
    </span>
  );
}

export default function RulesPage() {
  const { mandate, mandateLoaded, updateRules } = useMandate();
  const r = mandate.rules;

  const [monthlyCap, setMonthlyCap] = useState(r.monthlyCap);
  const [perTxCap, setPerTxCap] = useState(r.perTxCap);
  const [approvalAbove, setApprovalAbove] = useState(r.approvalAbove);
  const [cats, setCats] = useState<Category[]>(r.allowedCategories);
  const [words, setWords] = useState<string[]>(r.blockedKeywords);
  const [newWord, setNewWord] = useState("");
  const [expiresAt, setExpiresAt] = useState(r.expiresAt.split("T")[0]);
  const [state, setState] = useState<"idle" | "signing" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  // The mandate arrives after the first render; show the real rules once it does.
  useEffect(() => {
    setMonthlyCap(r.monthlyCap);
    setPerTxCap(r.perTxCap);
    setApprovalAbove(r.approvalAbove);
    setCats(r.allowedCategories);
    setWords(r.blockedKeywords);
    setExpiresAt(r.expiresAt.split("T")[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mandate.id, mandateLoaded]);

  const toggle = (c: Category) =>
    setCats((prev) => (prev.includes(c) ? (prev.length > 1 ? prev.filter((x) => x !== c) : prev) : [...prev, c]));

  const addWord = () => {
    const w = newWord.trim().toLowerCase();
    if (w && !words.includes(w)) setWords([...words, w]);
    setNewWord("");
  };

  const problems: string[] = [];
  if (perTxCap > monthlyCap) problems.push("A single purchase can't be bigger than the monthly limit.");
  if (approvalAbove > perTxCap) problems.push("The ask-me amount should be at or below the single-purchase limit.");
  if (monthlyCap <= 0 || perTxCap <= 0) problems.push("Limits need to be more than $0.");

  const save = async () => {
    if (problems.length) return;
    setState("signing");
    setError("");
    const rules: Rules = {
      currency: "USD",
      monthlyCap: Number(monthlyCap),
      perTxCap: Number(perTxCap),
      approvalAbove: Number(approvalAbove),
      allowedCategories: cats,
      allowedMerchants: r.allowedMerchants?.length ? r.allowedMerchants : ["demo-store"],
      blockedKeywords: words,
      expiresAt: new Date(expiresAt).toISOString(),
    };
    try {
      await updateRules(rules); // may send Anita to PayPal to save her account
      setState("saved");
      setTimeout(() => setState("idle"), 4000);
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  };

  return (
    <div className="max-w-[860px]">
      <h1 className="text-[2.4rem] font-extrabold leading-tight">Anita&apos;s rules</h1>
      <p className="mt-2 max-w-[62ch] text-[1.08rem] text-ink-600">
        Edit the sentence, then sign it. Mandate checks every cart the agent builds against exactly these words.
      </p>

      <section aria-label="Spending rules" className="mt-8 rounded-[26px] bg-white p-7 sm:p-10">
        <p className="font-display text-[1.65rem] font-semibold leading-[1.6] tracking-[-0.015em] text-ink sm:text-[1.9rem]">
          My agent may spend up to
          <Amount label="Monthly limit in dollars" value={monthlyCap} onChange={setMonthlyCap} />a month, never more than
          <Amount label="Single purchase limit in dollars" value={perTxCap} onChange={setPerTxCap} />
          at once, and must ask me before anything over
          <Amount label="Ask-me amount in dollars" value={approvalAbove} onChange={setApprovalAbove} />.
        </p>

        <div className="mt-8">
          <p className="font-display text-[1.25rem] font-semibold">It may only buy</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ALL_CATEGORIES.map((c) => {
              const on = cats.includes(c);
              return (
                <button
                  key={c}
                  onClick={() => toggle(c)}
                  aria-pressed={on}
                  className={cn(
                    "rounded-full border px-4 py-2 font-medium transition-colors",
                    on ? "border-pp bg-pp text-white" : "border-line bg-white text-ink-600 hover:border-pp hover:text-pp"
                  )}
                >
                  {CATEGORY_LABEL[c]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-8">
          <p className="font-display text-[1.25rem] font-semibold">and never anything mentioning</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {words.map((w) => (
              <span key={w} className="inline-flex items-center gap-1 rounded-full bg-stop-50 py-1.5 pl-3.5 pr-1.5 font-medium text-stop">
                {w}
                <button onClick={() => setWords(words.filter((x) => x !== w))} className="rounded-full p-1 hover:bg-white" aria-label={`Remove ${w}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-line py-1 pl-3.5 pr-1">
              <input
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addWord())}
                placeholder="add a word"
                aria-label="Add a blocked word"
                className="w-28 bg-transparent py-1 focus:outline-none"
              />
              <button onClick={addWord} className="rounded-full p-1.5 text-pp hover:bg-pp-50" aria-label="Add word">
                <Plus className="h-4 w-4" />
              </button>
            </span>
          </div>
        </div>

        <p className="mt-8 font-display text-[1.25rem] font-semibold">
          These rules end on{" "}
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            aria-label="Rules end date"
            className="rounded-lg border-b-2 border-pp bg-transparent px-1 font-bold text-pp focus:outline-none"
          />
          .
        </p>

        {problems.length > 0 && (
          <ul className="mt-6 space-y-1 rounded-2xl bg-ask-50 px-4 py-3 text-ask">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}

        <div className="mt-9 flex flex-wrap items-center gap-4 border-t border-line pt-7">
          <button onClick={save} disabled={state === "signing" || problems.length > 0} className="btn-pp px-7 py-3 text-[1.05rem]">
            {state === "signing" ? "Signing…" : "Sign and save rules"}
          </button>
          <p className="max-w-[46ch] text-sm text-ink-400">
            Signing replaces the old rules. If Anita hasn&apos;t saved a PayPal account yet, PayPal opens so she can.
          </p>
          {state === "saved" && (
            <span className="ml-auto flex items-center gap-2 font-semibold text-go">
              <Seal size={28} className="animate-stamp" /> Signed
            </span>
          )}
          {state === "error" && <p className="w-full text-stop">Couldn&apos;t sign the rules: {error}</p>}
        </div>
      </section>
    </div>
  );
}
