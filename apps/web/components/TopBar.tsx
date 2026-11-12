"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMandate } from "@/lib/state";
import { cn } from "@/lib/utils";
import { Seal } from "./Seal";
import { X } from "lucide-react";

const NAV = [
  { href: "/", label: "Agent" },
  { href: "/approvals", label: "Waiting for you" },
  { href: "/mandate", label: "Rules" },
  { href: "/receipts", label: "Activity" },
  { href: "/disputes", label: "Disputes" },
  { href: "/live", label: "Live" },
  { href: "/challenge", label: "Trick the agent" },
];

export function TopBar() {
  const pathname = usePathname();
  const { approvals, apiConnected, agentConnected, lastError, clearError } = useMandate();
  const waiting = approvals.filter((a) => a.status === "pending").length;
  const allUp = apiConnected && agentConnected;

  return (
    <>
      <header className="sticky top-0 z-40 bg-navy text-white">
        <div className="mx-auto flex max-w-[1180px] items-center gap-6 px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Mandate home">
            <Seal size={30} />
            <span className="font-display text-[1.35rem] font-bold tracking-[-0.03em]">Mandate</span>
          </Link>

          <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
            {NAV.map((n) => {
              const active = n.href === "/" ? pathname === "/" || pathname === "/agent" : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative rounded-full px-3.5 py-1.5 text-[0.95rem] font-medium transition-colors",
                    active ? "bg-white text-navy" : "text-white/75 hover:text-white"
                  )}
                >
                  {n.label}
                  {n.href === "/approvals" && waiting > 0 && (
                    <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ask px-1.5 text-2xs font-bold text-white">
                      {waiting}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2 text-sm text-white/80 md:ml-0" title={allUp ? "Agent and Mandate are online" : "Something is offline"}>
            <span className={cn("h-2.5 w-2.5 rounded-full", allUp ? "bg-sky shadow-[0_0_0_4px_rgba(96,205,255,.18)]" : "bg-stop")} />
            <span className="hidden sm:inline">{allUp ? "Agent online" : !apiConnected ? "Mandate offline" : "Agent offline"}</span>
          </div>
        </div>

        {/* mobile nav */}
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-4 pb-3 md:hidden">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={cn("whitespace-nowrap rounded-full px-3 py-1 text-sm", active ? "bg-white text-navy" : "text-white/75")}>
                {n.label}
                {n.href === "/approvals" && waiting > 0 ? ` (${waiting})` : ""}
              </Link>
            );
          })}
        </nav>
      </header>

      {lastError && (
        <div role="alert" className="border-b border-stop/20 bg-stop-50 text-stop">
          <div className="mx-auto flex max-w-[1180px] items-start gap-3 px-5 py-2.5 text-sm sm:px-8">
            <p className="flex-1">{lastError}</p>
            <button onClick={clearError} className="rounded-full p-1 hover:bg-white" aria-label="Dismiss message">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
