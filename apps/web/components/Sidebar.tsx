"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShieldCheck,
  LayoutDashboard,
  FileKey,
  Bot,
  CheckSquare,
  Receipt,
  Scale,
  ShoppingBag,
  ExternalLink,
  Circle,
  CreditCard,
} from "lucide-react";
import { useMandate } from "@/lib/state";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  const { mandate, approvals, disputes, apiConnected, agentConnected } = useMandate();

  const pendingCount = approvals.filter((a) => a.status === "pending").length;
  const activeDisputesCount = disputes.filter((d) => d.status === "open").length;

  const navItems = [
    {
      name: "Dashboard",
      href: "/",
      icon: LayoutDashboard,
    },
    {
      name: "Mandate Rules",
      href: "/mandate",
      icon: FileKey,
    },
    {
      name: "AI Agent Console",
      href: "/agent",
      icon: Bot,
    },
    {
      name: "Approvals",
      href: "/approvals",
      icon: CheckSquare,
      badge: pendingCount > 0 ? pendingCount : undefined,
      badgeColor: "bg-amber-500 text-white",
    },
    {
      name: "Receipt Log & Audit",
      href: "/receipts",
      icon: Receipt,
    },
    {
      name: "Dispute Defender",
      href: "/disputes",
      icon: Scale,
      badge: activeDisputesCount > 0 ? activeDisputesCount : undefined,
      badgeColor: "bg-rose-500 text-white",
    },
    {
      name: "Demo Store",
      href: "/store",
      icon: ShoppingBag,
    },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col flex-shrink-0 min-h-screen border-r border-slate-800">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-sky-400 flex items-center justify-center text-white shadow-lg shadow-brand-500/30 group-hover:scale-105 transition-transform">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-lg tracking-tight text-white">MANDATE</span>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-400/30">
                AI
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Agent Spending Permission</p>
          </div>
        </Link>
      </div>

      {/* Anita Profile & Status */}
      <div className="px-4 py-3 mx-3 my-3 bg-slate-800/60 rounded-xl border border-slate-700/60 text-xs">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-semibold text-slate-200 flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-brand-400" />
            Anita Sharma
          </span>
          <span
            className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded-full border",
              mandate.vaultId
                ? "text-emerald-400 bg-emerald-950/60 border-emerald-800/40"
                : "text-amber-300 bg-amber-950/40 border-amber-800/40"
            )}
          >
            {mandate.vaultId ? "PayPal Saved" : "PayPal Not Saved"}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>Monthly Cap:</span>
          <span className="font-mono text-slate-200 font-medium">
            ${mandate.spentThisMonth.toFixed(0)} / ${mandate.rules.monthlyCap}
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-2 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-600 text-white shadow-md shadow-brand-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              )}
            >
              <div className="flex items-center gap-3">
                <Icon className={cn("w-4 h-4", isActive ? "text-white" : "text-slate-400")} />
                <span>{item.name}</span>
              </div>
              {item.badge !== undefined && (
                <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-full", item.badgeColor)}>
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer System Status */}
      <div className="p-4 border-t border-slate-800 text-xs space-y-2">
        {[
          { label: "Mandate API", up: apiConnected },
          { label: "Agent server", up: agentConnected },
        ].map((svc) => (
          <div key={svc.label} className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1.5">
              <Circle className={cn("w-2 h-2 fill-current", svc.up ? "text-emerald-400" : "text-rose-400 animate-pulse")} />
              {svc.label}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-800 rounded text-slate-300">
              {svc.up ? "LIVE" : "OFFLINE"}
            </span>
          </div>
        ))}
        <div className="text-[11px] text-slate-500 flex items-center justify-between">
          <span>PayPal Hackathon '26</span>
          <span className="text-[10px] text-slate-400 font-mono">USD Sandbox</span>
        </div>
      </div>
    </aside>
  );
}
