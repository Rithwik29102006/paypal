"use client";

import { useMandate } from "@/lib/state";
import { cn } from "@/lib/utils";

/** Kid's allowance: flip between Anita's agent and her son Sam's, each bound by its own slip. */
export function AgentSwitch() {
  const { who, switchAgent, agentRunning } = useMandate();
  const opts = [
    { id: "anita" as const, label: "Anita's agent", sub: "the family shop" },
    { id: "sam" as const, label: "Sam's agent", sub: "age 15, small allowance" },
  ];
  return (
    <div role="radiogroup" aria-label="Whose agent" className="grid grid-cols-2 gap-1 rounded-[18px] bg-white p-1">
      {opts.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={who === o.id}
          disabled={agentRunning}
          onClick={() => switchAgent(o.id)}
          className={cn("rounded-[14px] px-3 py-2.5 text-left transition-colors", who === o.id ? "bg-navy text-white" : "text-ink-600 hover:bg-mist")}
        >
          <span className="block font-semibold">{o.label}</span>
          <span className={cn("block text-sm", who === o.id ? "text-white/70" : "text-ink-400")}>{o.sub}</span>
        </button>
      ))}
    </div>
  );
}
