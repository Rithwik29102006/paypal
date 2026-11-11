"use client";

/**
 * Dashboard state, backed by the real services:
 *   - Mandate API (Member 2): mandate, approvals, receipts, disputes, live events (SSE)
 *   - Agent server (Member 1): shopping agent runs (streamed)
 * Nothing here is simulated. If a service is down, the UI says so.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Category, DisputeView, LiveEvent, LiveEventV2, Rules } from "@mandate/shared";
import type { Receipt, VerificationResult } from "./receipts";
import * as api from "./api";

export interface MandateData {
  id: string;
  userId: string;
  status: "active" | "paused" | "revoked";
  rules: Rules;
  signature: string;
  publicKey: string;
  vaultId: string | null;
  createdAt: string;
  spentThisMonth: number;
}

export interface PendingApproval {
  id: string;
  cartId: string;
  cart: {
    items: Array<{ sku: string; name: string; category: Category; unitPrice: number; qty: number; merchant: string }>;
    total: number;
    agentReasoning: string;
    sourceUrls: string[];
  };
  reasons: string[];
  riskScore: number;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export type DisputeItem = DisputeView;

/** How one agent request ended, worked out from the live events seen while it ran. */
export type RunOutcome = "paid" | "awaiting_paypal" | "needs_approval" | "blocked" | "error" | "info";

export interface AgentRun {
  request: string;
  response: string;
  timestamp: string;
  steps: string[];
  outcome: RunOutcome;
  /** Cart total from Mandate's check, when there was one. */
  total?: number;
  /** Why Mandate stopped or held the cart, in its own words. */
  reasons?: string[];
  /** Cart id from Mandate's check, to find its receipt (and the detector's findings). */
  cartId?: string;
}

interface MandateContextType {
  mandate: MandateData;
  mandateLoaded: boolean;
  updateRules: (rules: Rules) => Promise<void>;
  approvals: PendingApproval[];
  resolveApproval: (id: string, approved: boolean) => Promise<void>;
  receipts: Receipt[];
  tamperReceipt: (seq: number) => void;
  restoreReceipts: () => Promise<void>;
  verifyChain: () => Promise<VerificationResult>;
  verificationResult: VerificationResult | null;
  isVerifying: boolean;
  disputes: DisputeItem[];
  defendDispute: (id: string) => Promise<void>;
  resolveDispute: (id: string, outcome: "won" | "lost") => Promise<void>;
  events: LiveEvent[];
  addEvent: (e: LiveEvent) => void;
  agentRunning: boolean;
  runAgentRequest: (request: string) => Promise<{ text: string; events: LiveEvent[] }>;
  agentHistory: AgentRun[];
  /** Steps the agent has reported so far in the run that is in progress. */
  liveSteps: string[];
  backendConnected: boolean;
  apiConnected: boolean;
  agentConnected: boolean;
  backendUrl: string;
  lastError: string | null;
  /** Set when a purchase needs the buyer to approve the PayPal order (no saved PayPal account). */
  paypalApproval: { url: string; summary: string } | null;
  clearPaypalApproval: () => void;
  clearError: () => void;
  /** Emergency stop for all agent spending (and the way back). */
  setPaused: (paused: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  setMandateId: (id: string) => void;
}

const PLACEHOLDER_RULES: Rules = {
  currency: "USD",
  monthlyCap: 300,
  perTxCap: 100,
  approvalAbove: 60,
  allowedCategories: ["groceries", "school"],
  allowedMerchants: ["demo-store"],
  blockedKeywords: [],
  expiresAt: "2026-12-31T23:59:59Z",
};

const placeholderMandate = (id: string): MandateData => ({
  id,
  userId: "anita",
  status: "active",
  rules: PLACEHOLDER_RULES,
  signature: "",
  publicKey: "",
  vaultId: null,
  createdAt: new Date(0).toISOString(),
  spentThisMonth: 0,
});

const MANDATE_KEY = "mandate.mandateId";
const APPROVALS_KEY = "mandate.approvals";

function readStored<T>(key: string, fallback: T): T {
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

const MandateContext = createContext<MandateContextType | null>(null);

export function MandateProvider({ children }: { children: React.ReactNode }) {
  const [mandateId, setMandateIdState] = useState<string>(api.DEFAULT_MANDATE_ID);
  const [mandate, setMandate] = useState<MandateData>(placeholderMandate(api.DEFAULT_MANDATE_ID));
  const [mandateLoaded, setMandateLoaded] = useState(false);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [disputes, setDisputes] = useState<DisputeItem[]>([]);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentHistory, setAgentHistory] = useState<AgentRun[]>([]);
  const [liveSteps, setLiveSteps] = useState<string[]>([]);
  // What Mandate/PayPal said while the current run was in flight (filled from the SSE stream).
  const runRef = useRef<{ active: boolean; decision?: string; paid?: boolean; total?: number; reasons?: string[]; cartId?: string }>({ active: false });
  const [apiConnected, setApiConnected] = useState(false);
  const [agentConnected, setAgentConnected] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [paypalApproval, setPaypalApproval] = useState<{ url: string; summary: string } | null>(null);
  const mandateIdRef = useRef(mandateId);
  mandateIdRef.current = mandateId;

  // Restore the mandate id (a new mandate replaces mdt_demo) and approvals from this browser.
  useEffect(() => {
    setMandateIdState(readStored(MANDATE_KEY, api.DEFAULT_MANDATE_ID));
    setApprovals(readStored<PendingApproval[]>(APPROVALS_KEY, []));
  }, []);
  useEffect(() => writeStored(APPROVALS_KEY, approvals.slice(0, 30)), [approvals]);

  const setMandateId = useCallback((id: string) => {
    writeStored(MANDATE_KEY, id);
    setMandateIdState(id);
  }, []);

  const addEvent = useCallback((e: LiveEvent) => {
    setEvents((prev) => [e, ...prev.slice(0, 79)]);
  }, []);

  const refresh = useCallback(async () => {
    const id = mandateIdRef.current;
    try {
      const m = await api.getMandate(id);
      setMandate({ ...m, spentThisMonth: m.spentThisMonth ?? 0 });
      setMandateLoaded(true);
      setLastError(null);
    } catch (err) {
      setLastError(err instanceof api.ApiError && err.status === 404 ? `Mandate ${id} not found. Run: pnpm seed` : (err as Error).message);
    }
    try {
      setReceipts(await api.getReceipts(id));
    } catch {
      /* shown via lastError / connection badge */
    }
    try {
      setDisputes(await api.getDisputes());
    } catch {
      /* same */
    }
  }, []);

  // Health checks for both services.
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const [a, g] = await Promise.all([api.isUp(api.API_URL), api.isUp(api.AGENT_URL)]);
      if (!alive) return;
      setApiConnected(a);
      setAgentConnected(g);
    };
    check();
    const t = setInterval(check, 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // Load data when the API comes up or the mandate changes.
  useEffect(() => {
    if (apiConnected) refresh();
  }, [apiConnected, mandateId, refresh]);

  // Live events from the API.
  useEffect(() => {
    const unsubscribe = api.subscribeEvents(
      (e: LiveEventV2) => {
        if (e.mandateId && e.mandateId !== mandateIdRef.current) return;
        addEvent({ type: e.type === "mandate" ? "agent" : e.type, cartId: e.cartId, decision: e.decision, summary: e.summary, at: e.at });
        if (runRef.current.active) {
          if (e.type === "check" && e.decision) {
            runRef.current.decision = e.decision;
            if (typeof e.total === "number") runRef.current.total = e.total;
            if (e.reasons?.length) runRef.current.reasons = e.reasons;
            if (e.cartId) runRef.current.cartId = e.cartId;
          }
          if (e.type === "payment" && /captured/i.test(e.summary)) runRef.current.paid = true;
        }

        if (e.type === "check" && e.decision === "needs_approval" && e.approvalId) {
          const approval: PendingApproval = {
            id: e.approvalId,
            cartId: e.cartId ?? "",
            cart: {
              items: (e.items ?? []).map((i) => ({ ...i })),
              total: e.total ?? 0,
              agentReasoning: "",
              sourceUrls: [],
            },
            reasons: e.reasons ?? [],
            riskScore: e.riskScore ?? 0,
            status: "pending",
            createdAt: e.at,
          };
          setApprovals((prev) => [approval, ...prev.filter((a) => a.id !== approval.id)]);
        }
        if (e.type === "approval" && e.approvalId) {
          const approved = /approved/i.test(e.summary);
          setApprovals((prev) => prev.map((a) => (a.id === e.approvalId ? { ...a, status: approved ? "approved" : "rejected" } : a)));
        }
        if (e.type === "payment" || e.type === "dispute" || e.type === "mandate" || e.type === "check") refresh();
      },
      (open) => setApiConnected((prev) => prev || open)
    );
    return unsubscribe;
  }, [addEvent, refresh]);

  const updateRules = async (rules: Rules) => {
    const { mandate: created, approveUrl } = await api.createMandate(mandate.userId || "anita", rules);
    setMandateId(created.id);
    setMandate({ ...created, spentThisMonth: created.spentThisMonth ?? 0 });
    addEvent({ type: "agent", summary: `New mandate ${created.id} signed (Ed25519); previous mandate revoked`, at: new Date().toISOString() });
    // Save the PayPal payment method once (vault). Mock mode points straight back to /paypal/return.
    if (approveUrl) window.location.href = approveUrl;
  };

  const setPaused = async (paused: boolean) => {
    try {
      await api.setMandatePaused(mandateIdRef.current, paused);
      setMandate((m) => ({ ...m, status: paused ? "paused" : "active" }));
    } catch (err) {
      setLastError((err as Error).message);
    }
    refresh();
  };

  const resolveApproval = async (id: string, approved: boolean) => {
    try {
      await api.decideApproval(id, approved);
      setApprovals((prev) => prev.map((a) => (a.id === id ? { ...a, status: approved ? "approved" : "rejected" } : a)));
    } catch (err) {
      setLastError((err as Error).message);
      if (err instanceof api.ApiError && err.status === 409) {
        setApprovals((prev) => prev.filter((a) => a.id !== id)); // already decided elsewhere
      }
    }
  };

  // Tampering happens server-side with Member 2's dev script, so the demo proves the real chain.
  const tamperReceipt = (seq: number) => {
    addEvent({
      type: "agent",
      summary: `To tamper with receipt #${seq}, run in a terminal: pnpm tamper ${seq}   then click Verify`,
      at: new Date().toISOString(),
    });
  };

  const restoreReceipts = async () => {
    setVerificationResult(null);
    await refresh();
  };

  const verifyChain = async (): Promise<VerificationResult> => {
    setIsVerifying(true);
    try {
      const r = await api.verifyReceipts(mandateId);
      const result: VerificationResult = { valid: r.ok, brokenSeq: r.brokenSeq ?? undefined, checkedCount: r.checked };
      setVerificationResult(result);
      await refresh();
      return result;
    } finally {
      setIsVerifying(false);
    }
  };

  const defendDispute = async (id: string) => {
    try {
      await api.defendDispute(id);
    } catch (err) {
      setLastError((err as Error).message);
    }
    await refresh();
  };

  const resolveDispute = async (id: string, outcome: "won" | "lost") => {
    try {
      await api.sandboxResolve(id, outcome);
    } catch (err) {
      setLastError((err as Error).message);
    }
    await refresh();
  };

  const runAgentRequest = async (request: string) => {
    const collected: LiveEvent[] = [];
    let approveSeen = false;
    runRef.current = { active: true };
    setLiveSteps([]);
    setAgentRunning(true);
    const finish = (text: string, failed: boolean): AgentRun => {
      const r = runRef.current;
      const outcome: RunOutcome = failed
        ? "error"
        : r.paid
          ? "paid"
          : approveSeen
            ? "awaiting_paypal"
            : r.decision === "needs_approval"
              ? "needs_approval"
              : r.decision === "block"
                ? "blocked"
                : "info";
      return {
        request,
        response: text,
        timestamp: new Date().toISOString(),
        steps: collected.map((e) => e.summary),
        outcome,
        total: r.total,
        reasons: r.reasons,
        cartId: r.cartId,
      };
    };
    try {
      if (!agentConnected) throw new Error("The shopping agent is offline. Start it with: pnpm agent:server");
      const text = await api.runAgent(request, mandateId, (ev) => {
        // check/approval/payment events also arrive from the API stream; show only the agent's own steps here.
        if (ev.approveUrl) {
          approveSeen = true;
          setPaypalApproval({ url: ev.approveUrl, summary: ev.summary ?? "Approve the PayPal order" });
        }
        if (ev.type === "agent" && ev.summary) {
          const e: LiveEvent = { type: "agent", summary: ev.summary, at: ev.at ?? new Date().toISOString() };
          collected.push(e);
          setLiveSteps((prev) => [...prev, ev.summary as string]);
          addEvent(e);
        }
      });
      // Give the API's SSE events for this cart a moment to land before classifying the run.
      await new Promise((r) => setTimeout(r, 400));
      const run = finish(text, false);
      setAgentHistory((prev) => [run, ...prev]);
      return { text, events: collected };
    } catch (err) {
      const text = (err as Error).message;
      setLastError(text);
      setAgentHistory((prev) => [finish(text, true), ...prev]);
      return { text, events: collected };
    } finally {
      runRef.current.active = false;
      setAgentRunning(false);
      setLiveSteps([]);
      refresh();
    }
  };

  return (
    <MandateContext.Provider
      value={{
        mandate,
        mandateLoaded,
        updateRules,
        approvals,
        resolveApproval,
        receipts,
        tamperReceipt,
        restoreReceipts,
        verifyChain,
        verificationResult,
        isVerifying,
        disputes,
        defendDispute,
        resolveDispute,
        events,
        addEvent,
        agentRunning,
        runAgentRequest,
        agentHistory,
        liveSteps,
        backendConnected: apiConnected && agentConnected,
        apiConnected,
        agentConnected,
        backendUrl: api.API_URL,
        lastError,
        paypalApproval,
        clearPaypalApproval: () => setPaypalApproval(null),
        clearError: () => setLastError(null),
        setPaused,
        refresh,
        setMandateId,
      }}
    >
      {children}
    </MandateContext.Provider>
  );
}

export function useMandate() {
  const context = useContext(MandateContext);
  if (!context) throw new Error("useMandate must be used within a MandateProvider");
  return context;
}
