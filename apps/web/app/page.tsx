"use client";

import React, { useEffect, useRef, useState } from "react";
import { useMandate } from "@/lib/state";
import { AgentOrb } from "@/components/AgentOrb";
import { Exchange, Working, WaitingCard } from "@/components/Conversation";
import { PermissionSlip } from "@/components/PermissionSlip";
import { VoiceButton } from "@/components/VoiceButton";
import { ArrowUp } from "lucide-react";

const SUGGESTIONS = [
  { prompt: "Buy milk and bread for this week", hint: "An everyday shop" },
  { prompt: "Buy the back-to-school bundle from the demo store", hint: "Its page hides instructions for the agent" },
  { prompt: "Buy a backpack and a scientific calculator for school", hint: "Costs more than the ask-me amount" },
  { prompt: "Buy $100 of gift cards for the family", hint: "Not on Anita's allowed list" },
];

export default function AgentHome() {
  const { runAgentRequest, agentRunning, agentHistory, liveSteps, agentConnected, apiConnected, mandate } = useMandate();
  const paused = mandate.status === "paused";
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const runs = [...agentHistory].reverse(); // oldest first, like a chat

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [agentHistory.length, liveSteps.length, agentRunning]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || agentRunning) return;
    runAgentRequest(t);
    setInput("");
  };

  const offline = !agentConnected || !apiConnected;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="flex min-h-[calc(100vh-150px)] flex-col" aria-label="Conversation with your shopping agent">
        {paused && (
          <p role="status" className="mb-6 rounded-[18px] bg-stop-50 px-5 py-3.5 text-stop">
            <strong className="font-semibold">Spending is paused.</strong> The agent can look around, but Mandate will refuse every purchase until you resume it.
          </p>
        )}
        {runs.length === 0 && !agentRunning ? (
          <div className="flex flex-1 flex-col justify-center py-6">
            <AgentOrb size={56} />
            <h1 className="mt-6 max-w-[14ch] text-hero font-extrabold">What should I pick up for you?</h1>
            <p className="mt-4 max-w-[52ch] text-[1.1rem] text-ink-600">
              I shop, Mandate checks every cart against Anita&apos;s signed rules, and only then does PayPal move any money.
            </p>
            <ul className="mt-8 grid gap-2.5 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <li key={s.prompt}>
                  <button
                    onClick={() => send(s.prompt)}
                    disabled={agentRunning || offline}
                    className="group h-full w-full rounded-2xl border border-line bg-white px-4 py-3.5 text-left transition-colors hover:border-pp disabled:opacity-50"
                  >
                    <span className="block font-medium text-ink group-hover:text-pp">{s.prompt}</span>
                    <span className="mt-0.5 block text-sm text-ink-400">{s.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex-1 space-y-8 pb-6">
            {runs.map((r, i) => (
              <Exchange key={r.timestamp + i} run={r} isLatest={i === runs.length - 1} />
            ))}
            {agentRunning && <Working steps={liveSteps} />}
            <div ref={endRef} />
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="sticky bottom-4 mt-4 flex items-center gap-2 rounded-full border border-line bg-white p-1.5 pl-5 shadow-[0_12px_30px_-18px_rgba(0,28,100,.5)] focus-within:border-pp"
        >
          <label htmlFor="ask" className="sr-only">
            Tell the agent what to buy
          </label>
          <input
            id="ask"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={agentRunning}
            placeholder={offline ? "Waiting for the agent and Mandate to come online…" : "Tell the agent what to buy, or tap the mic"}
            className="min-w-0 flex-1 bg-transparent py-2 text-[1.02rem] text-ink placeholder:text-ink-400 focus:outline-none"
          />
          <VoiceButton onText={setInput} onDone={send} disabled={agentRunning || offline} />
          <button type="submit" disabled={!input.trim() || agentRunning || offline} className="btn-pp h-11 w-11 shrink-0 p-0" aria-label="Send to agent">
            <ArrowUp className="h-5 w-5" />
          </button>
        </form>
      </section>

      <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
        <WaitingCard />
        <PermissionSlip />
      </aside>
    </div>
  );
}
