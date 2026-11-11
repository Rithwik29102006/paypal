import { cn } from "@/lib/utils";
import type { RunOutcome } from "@/lib/state";
import { Bot, ShieldCheck, ShieldX, ShieldQuestion, Hourglass } from "lucide-react";

type NodeState = "done" | "ask" | "stop" | "idle" | "busy";

const NODE_STYLE: Record<NodeState, string> = {
  done: "bg-go text-white",
  ask: "bg-ask text-white",
  stop: "bg-stop text-white",
  idle: "bg-white text-ink-400 border border-dashed border-line",
  busy: "bg-pp text-white animate-pulse",
};

function PayPalGlyph({ className }: { className?: string }) {
  // Simple "P" monogram in PayPal's two blues (not the trademarked logo).
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M8 4h6.2c3 0 4.8 1.6 4.4 4.2-.4 2.9-2.6 4.4-5.6 4.4h-2.2L9.9 18H6.6L8 4z" fill="currentColor" opacity=".55" />
      <path d="M9.6 6.5h4c1.9 0 3 1 2.7 2.7-.3 1.9-1.7 2.9-3.6 2.9h-1.8L10.2 16H7.8l1.8-9.5z" fill="currentColor" />
    </svg>
  );
}

/**
 * Agent -> Mandate -> PayPal. Shows where a purchase got to and where it stopped:
 * the product's whole idea in one strip.
 */
export function HandoffRail({ outcome, running = false }: { outcome?: RunOutcome; running?: boolean }) {
  let agent: NodeState = "done";
  let mandate: NodeState = "idle";
  let paypal: NodeState = "idle";
  let mandateText = "Checks the rules";
  let paypalText = "Moves the money";

  if (running) {
    agent = "busy";
  } else {
    switch (outcome) {
      case "paid":
        mandate = "done"; paypal = "done"; mandateText = "Allowed"; paypalText = "Paid";
        break;
      case "awaiting_paypal":
        mandate = "done"; paypal = "ask"; mandateText = "Allowed"; paypalText = "Waiting for your OK";
        break;
      case "needs_approval":
        mandate = "ask"; mandateText = "Asking you first"; paypalText = "On hold";
        break;
      case "blocked":
        mandate = "stop"; mandateText = "Stopped it"; paypalText = "Never charged";
        break;
      case "error":
        agent = "stop";
        break;
      default:
        mandateText = "Not needed"; paypalText = "Not needed";
    }
  }

  const MandateIcon = mandate === "stop" ? ShieldX : mandate === "ask" ? ShieldQuestion : ShieldCheck;
  const nodes = [
    { key: "agent", label: "Agent", text: running ? "Shopping…" : agent === "stop" ? "Couldn't finish" : "Built the cart", state: agent, icon: <Bot className="h-4 w-4" /> },
    { key: "mandate", label: "Mandate", text: mandateText, state: mandate, icon: <MandateIcon className="h-4 w-4" /> },
    {
      key: "paypal",
      label: "PayPal",
      text: paypalText,
      state: paypal,
      icon: paypal === "ask" ? <Hourglass className="h-4 w-4" /> : <PayPalGlyph className="h-5 w-5" />,
    },
  ];

  return (
    <ol className="flex items-start" aria-label="Where this purchase got to">
      {nodes.map((n, i) => {
        const nextState = nodes[i + 1]?.state;
        const broken = n.state === "stop" || n.state === "ask";
        return (
          <li key={n.key} className="flex flex-1 items-start last:flex-none">
            <div className="flex w-[84px] shrink-0 flex-col items-center text-center">
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", NODE_STYLE[n.state])}>{n.icon}</span>
              <span className="mt-1.5 text-2xs font-semibold text-ink">{n.label}</span>
              <span className={cn("text-2xs", n.state === "stop" ? "text-stop" : n.state === "ask" ? "text-ask" : "text-ink-400")}>{n.text}</span>
            </div>
            {i < nodes.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  "mt-[18px] h-[3px] flex-1 rounded-full",
                  broken ? "bg-[repeating-linear-gradient(90deg,#D8E1EF_0_6px,transparent_6px_11px)]" : nextState === "idle" ? "bg-line" : "bg-go"
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
