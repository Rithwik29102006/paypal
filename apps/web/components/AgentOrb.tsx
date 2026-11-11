import { cn } from "@/lib/utils";

/**
 * The agent's face: a small orb with a slow PayPal-blue sheen.
 * It spins faster while the agent is working.
 */
export function AgentOrb({ size = 36, busy = false, className }: { size?: number; busy?: boolean; className?: string }) {
  return (
    <span
      className={cn("relative inline-block shrink-0 overflow-hidden rounded-full", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={busy ? "Agent is working" : "Shopping agent"}
    >
      <span
        className={cn("absolute inset-[-40%]", busy ? "animate-orb-fast" : "animate-orb")}
        style={{ background: "conic-gradient(from 0deg, #001C64, #0070E0, #60CDFF, #0070E0, #001C64)" }}
      />
      <span className="absolute inset-[18%] rounded-full bg-white/95" />
      <span className="absolute inset-[34%] rounded-full bg-navy" />
    </span>
  );
}
