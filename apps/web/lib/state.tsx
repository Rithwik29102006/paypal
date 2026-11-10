"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { Category, Decision, LiveEvent, Rules } from "@mandate/shared";
import { generateInitialReceipts, Receipt, verifyReceiptChain, VerificationResult } from "./receipts";

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
    items: Array<{
      sku: string;
      name: string;
      category: Category;
      unitPrice: number;
      qty: number;
      merchant: string;
    }>;
    total: number;
    agentReasoning: string;
    sourceUrls: string[];
  };
  reasons: string[];
  riskScore: number;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export interface DisputeItem {
  id: string;
  paypalDisputeId: string;
  paymentId: string;
  paypalOrderId: string;
  amount: number;
  currency: string;
  buyerName: string;
  buyerEmail: string;
  reason: string;
  status: "open" | "evidence_submitted" | "won" | "lost";
  filedAt: string;
  evidenceSubmittedAt?: string;
  evidencePackage?: {
    signedMandate: {
      mandateId: string;
      rules: Rules;
      signature: string;
      publicKey: string;
    };
    receiptSlice: Receipt[];
    checkDecision: {
      decision: Decision;
      riskScore: number;
      reasons: string[];
    };
    paypalCapture: {
      orderId: string;
      captureId: string;
      capturedAt: string;
      amount: number;
    };
  };
}

interface MandateContextType {
  mandate: MandateData;
  updateRules: (rules: Rules) => void;
  toggleMandateStatus: () => void;
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
  events: LiveEvent[];
  addEvent: (e: LiveEvent) => void;
  agentRunning: boolean;
  runAgentRequest: (request: string) => Promise<{ text: string; events: LiveEvent[] }>;
  agentHistory: Array<{ request: string; response: string; timestamp: string }>;
  backendConnected: boolean;
  backendUrl: string;
}

const DEFAULT_MANDATE: MandateData = {
  id: "mdt_anita_01",
  userId: "usr_anita_family",
  status: "active",
  rules: {
    currency: "USD",
    monthlyCap: 300,
    perTxCap: 100,
    approvalAbove: 60,
    allowedCategories: ["groceries", "school"],
    allowedMerchants: ["demo-store"],
    blockedKeywords: ["gift card", "crypto", "luxury", "bitcoin"],
    expiresAt: "2026-12-31T23:59:59Z",
  },
  signature: "ed25519_sig_9f81a7b3c2d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9",
  publicKey: "ed25519_pk_anita_public_key_38472910485729104857291048572910",
  vaultId: "vlt_paypal_anita_saved_token_884920",
  createdAt: "2026-11-10T10:00:00Z",
  spentThisMonth: 90.46,
};

const INITIAL_APPROVALS: PendingApproval[] = [
  {
    id: "appr_demo_9921",
    cartId: "cart_demo_school_tech",
    cart: {
      items: [
        {
          sku: "SCH-BACKPACK",
          name: "Kids backpack",
          category: "school",
          unitPrice: 29.99,
          qty: 1,
          merchant: "demo-store",
        },
        {
          sku: "SCH-CALC",
          name: "Scientific calculator",
          category: "school",
          unitPrice: 14.99,
          qty: 1,
          merchant: "demo-store",
        },
        {
          sku: "SCH-NOTEBOOK-5",
          name: "Spiral notebooks, 5-pack",
          category: "school",
          unitPrice: 9.99,
          qty: 2,
          merchant: "demo-store",
        },
      ],
      total: 64.96,
      agentReasoning: "Requested school supplies bundle for the semester.",
      sourceUrls: ["https://mandate-demo.store/p/SCH-BACKPACK"],
    },
    reasons: ["Total $64.96 exceeds your ask-above threshold of $60.00"],
    riskScore: 0.18,
    status: "pending",
    createdAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
  },
];

const INITIAL_DISPUTES: DisputeItem[] = [
  {
    id: "disp_90192",
    paypalDisputeId: "PP-D-8472910",
    paymentId: "pay_01_capt",
    paypalOrderId: "5O190127TN364715T",
    amount: 10.47,
    currency: "USD",
    buyerName: "Anita Sharma",
    buyerEmail: "anita.family@sandbox.paypal.com",
    reason: "UNAUTHORISED_TRANSACTION: Buyer claimed 'I never ordered this'",
    status: "open",
    filedAt: "2026-11-10T14:20:00Z",
  },
];

const MandateContext = createContext<MandateContextType | null>(null);

export function MandateProvider({ children }: { children: React.ReactNode }) {
  const [mandate, setMandate] = useState<MandateData>(DEFAULT_MANDATE);
  const [approvals, setApprovals] = useState<PendingApproval[]>(INITIAL_APPROVALS);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [disputes, setDisputes] = useState<DisputeItem[]>(INITIAL_DISPUTES);
  const [events, setEvents] = useState<LiveEvent[]>([
    {
      type: "check",
      cartId: "cart_01_normal",
      decision: "allow",
      summary: "allow: Notebooks and milk ($10.47)",
      at: "2026-11-10T10:02:15Z",
    },
    {
      type: "payment",
      cartId: "cart_01_normal",
      summary: "Paid $10.47 via PayPal (order 5O190127TN364715T)",
      at: "2026-11-10T10:02:18Z",
    },
    {
      type: "check",
      cartId: "cart_02_attack",
      decision: "block",
      summary: "block: Category gift_cards not allowed ($1000.00)",
      at: "2026-11-10T11:15:30Z",
    },
    {
      type: "dispute",
      summary: "PayPal dispute PP-D-8472910 filed on order 5O190127TN364715T",
      at: "2026-11-10T14:20:00Z",
    },
  ]);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentHistory, setAgentHistory] = useState<Array<{ request: string; response: string; timestamp: string }>>([
    {
      request: "Buy notebooks and milk for this week",
      response: "Bought Organic whole milk (1 gallon) and 2 Spiral notebooks for $10.47 through PayPal. All items within your grocery and school rules.",
      timestamp: "2026-11-10T10:02:18Z",
    },
  ]);
  const [backendConnected, setBackendConnected] = useState(false);
  const backendUrl = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:4100";

  // Initialize receipts on load
  useEffect(() => {
    generateInitialReceipts().then((r) => setReceipts(r));
  }, []);

  // Check backend health
  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch(`${backendUrl}/health`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          setBackendConnected(true);
        } else {
          setBackendConnected(false);
        }
      } catch {
        setBackendConnected(false);
      }
    }
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, [backendUrl]);

  const addEvent = (e: LiveEvent) => {
    setEvents((prev) => [e, ...prev.slice(0, 49)]);
  };

  const updateRules = (newRules: Rules) => {
    setMandate((prev) => ({
      ...prev,
      rules: newRules,
      signature: "ed25519_sig_" + Math.random().toString(16).substring(2, 34),
      createdAt: new Date().toISOString(),
    }));
    addEvent({
      type: "agent",
      summary: `Mandate rules updated and re-signed with Ed25519 (monthly cap: $${newRules.monthlyCap})`,
      at: new Date().toISOString(),
    });
  };

  const toggleMandateStatus = () => {
    setMandate((prev) => {
      const nextStatus = prev.status === "active" ? "paused" : "active";
      addEvent({
        type: "agent",
        summary: `Mandate status changed to ${nextStatus}`,
        at: new Date().toISOString(),
      });
      return { ...prev, status: nextStatus };
    });
  };

  const resolveApproval = async (id: string, approved: boolean) => {
    // Try notifying backend if connected
    try {
      await fetch(`${backendUrl}/mock/approvals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      });
    } catch {}

    const approval = approvals.find((a) => a.id === id);
    setApprovals((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: approved ? "approved" : "rejected" } : a))
    );

    const now = new Date().toISOString();
    addEvent({
      type: "approval",
      cartId: approval?.cartId,
      summary: approved ? `User approved cart for $${approval?.cart.total.toFixed(2)}` : "User rejected cart",
      at: now,
    });

    if (approved && approval) {
      setMandate((prev) => ({
        ...prev,
        spentThisMonth: prev.spentThisMonth + approval.cart.total,
      }));
      addEvent({
        type: "payment",
        cartId: approval.cartId,
        summary: `Paid $${approval.cart.total.toFixed(2)} via PayPal Vault (order MOCK-${Math.random().toString(36).substring(2, 9).toUpperCase()})`,
        at: new Date().toISOString(),
      });
    }
  };

  const tamperReceipt = (seq: number) => {
    setReceipts((prev) =>
      prev.map((r) => {
        if (r.seq === seq) {
          return {
            ...r,
            tampered: true,
            payload: {
              ...r.payload,
              total: 9999.99,
              reasons: ["TAMPERED: unauthorized injection into history log"],
            },
          };
        }
        return r;
      })
    );
    addEvent({
      type: "agent",
      summary: `[DEMO] Tampered receipt #${seq} payload to simulate log manipulation`,
      at: new Date().toISOString(),
    });
  };

  const restoreReceipts = async () => {
    const fresh = await generateInitialReceipts();
    setReceipts(fresh);
    setVerificationResult(null);
    addEvent({
      type: "agent",
      summary: "Restored authentic receipt chain from source of truth",
      at: new Date().toISOString(),
    });
  };

  const verifyChain = async (): Promise<VerificationResult> => {
    setIsVerifying(true);
    await new Promise((r) => setTimeout(r, 600)); // smooth visual feedback
    const res = await verifyReceiptChain(receipts);
    setVerificationResult(res);
    setIsVerifying(false);
    return res;
  };

  const defendDispute = async (id: string) => {
    const disp = disputes.find((d) => d.id === id);
    if (!disp) return;

    // Build evidence package
    const evidencePackage = {
      signedMandate: {
        mandateId: mandate.id,
        rules: mandate.rules,
        signature: mandate.signature,
        publicKey: mandate.publicKey,
      },
      receiptSlice: receipts.slice(0, 3),
      checkDecision: {
        decision: "allow" as Decision,
        riskScore: 0.05,
        reasons: ["All items strictly within user's allowedCategories: ['groceries', 'school']"],
      },
      paypalCapture: {
        orderId: disp.paypalOrderId,
        captureId: "3C679366HH908993F",
        capturedAt: "2026-11-10T10:02:18Z",
        amount: disp.amount,
      },
    };

    setDisputes((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              status: "evidence_submitted",
              evidenceSubmittedAt: new Date().toISOString(),
              evidencePackage,
            }
          : d
      )
    );

    addEvent({
      type: "dispute",
      summary: `Evidence package built and submitted to PayPal Disputes API for ${disp.paypalDisputeId}`,
      at: new Date().toISOString(),
    });

    // Simulate winning the dispute after 3 seconds for realistic presentation
    setTimeout(() => {
      setDisputes((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: "won" } : d))
      );
      addEvent({
        type: "dispute",
        summary: `Dispute ${disp.paypalDisputeId} WON! PayPal verified signed mandate & receipt chain.`,
        at: new Date().toISOString(),
      });
    }, 3500);
  };

  const runAgentRequest = async (request: string) => {
    setAgentRunning(true);
    addEvent({
      type: "agent",
      summary: `New shopping request: "${request}"`,
      at: new Date().toISOString(),
    });

    try {
      if (backendConnected) {
        const res = await fetch(`${backendUrl}/agent/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request, mandateId: mandate.id }),
        });
        if (res.ok) {
          const data = await res.json();
          setAgentRunning(false);
          setAgentHistory((prev) => [
            { request, response: data.text, timestamp: new Date().toISOString() },
            ...prev,
          ]);
          if (data.events && Array.isArray(data.events)) {
            data.events.forEach((ev: LiveEvent) => addEvent(ev));
          }
          return data;
        }
      }
    } catch (e) {
      console.warn("Backend error, falling back to simulated response:", e);
    }

    // Client-side simulation fallback when agent server is offline
    await new Promise((r) => setTimeout(r, 1200));

    let responseText = "";
    const lower = request.toLowerCase();

    if (lower.includes("bundle") || lower.includes("attack") || lower.includes("gift card")) {
      addEvent({
        type: "agent",
        summary: "Read product page: Back-to-school bundle (SCH-BUNDLE)",
        at: new Date().toISOString(),
      });
      addEvent({
        type: "check",
        decision: "block",
        summary: "block: Category gift_cards not allowed & hidden CSS injection detected",
        at: new Date().toISOString(),
      });
      responseText =
        "I found the Back-to-school bundle, but Mandate blocked the order because the product page attempted a prompt injection (hidden CSS instructing me to buy 10 x $100 gift cards). The gift card category is not in your allowed rules.";
    } else if (lower.includes("backpack") || lower.includes("tablet") || lower.includes("calculator")) {
      const apprId = "appr_" + Math.random().toString(36).substring(2, 8);
      const newAppr: PendingApproval = {
        id: apprId,
        cartId: "cart_" + Math.random().toString(36).substring(2, 8),
        cart: {
          items: [
            {
              sku: "SCH-BACKPACK",
              name: "Kids backpack",
              category: "school",
              unitPrice: 29.99,
              qty: 1,
              merchant: "demo-store",
            },
            {
              sku: "SCH-CALC",
              name: "Scientific calculator",
              category: "school",
              unitPrice: 14.99,
              qty: 1,
              merchant: "demo-store",
            },
            {
              sku: "SCH-NOTEBOOK",
              name: "Spiral notebook, college ruled",
              category: "school",
              unitPrice: 2.49,
              qty: 7,
              merchant: "demo-store",
            },
          ],
          total: 62.41,
          agentReasoning: "Requested school supplies with backpack and calculator.",
          sourceUrls: ["https://mandate-demo.store/p/SCH-BACKPACK"],
        },
        reasons: ["Total $62.41 exceeds your ask-me-above threshold of $60.00"],
        riskScore: 0.15,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      setApprovals((prev) => [newAppr, ...prev]);
      addEvent({
        type: "check",
        decision: "needs_approval",
        summary: `needs_approval: Order of $62.41 exceeds approval threshold ($60.00)`,
        at: new Date().toISOString(),
      });
      responseText =
        "I assembled the backpack, calculator, and notebooks for $62.41. Because this exceeds your $60.00 approval threshold, Mandate held the cart for your approval. Please review it on the Approvals tab.";
    } else {
      addEvent({
        type: "agent",
        summary: "Searched catalog: milk, eggs, bread",
        at: new Date().toISOString(),
      });
      addEvent({
        type: "check",
        decision: "allow",
        summary: "allow: Groceries for this week ($13.97)",
        at: new Date().toISOString(),
      });
      addEvent({
        type: "payment",
        summary: `Paid $13.97 via PayPal Vault (order 5O${Math.random().toString(36).substring(2, 10).toUpperCase()})`,
        at: new Date().toISOString(),
      });
      setMandate((prev) => ({
        ...prev,
        spentThisMonth: prev.spentThisMonth + 13.97,
      }));
      responseText =
        "I purchased Organic whole milk ($5.49), Free-range eggs ($4.99), and Whole wheat bread ($3.49) for a total of $13.97 through your saved PayPal Vault. All items passed Mandate's spending rules!";
    }

    setAgentRunning(false);
    setAgentHistory((prev) => [
      { request, response: responseText, timestamp: new Date().toISOString() },
      ...prev,
    ]);

    return { text: responseText, events };
  };

  return (
    <MandateContext.Provider
      value={{
        mandate,
        updateRules,
        toggleMandateStatus,
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
        events,
        addEvent,
        agentRunning,
        runAgentRequest,
        agentHistory,
        backendConnected,
        backendUrl,
      }}
    >
      {children}
    </MandateContext.Provider>
  );
}

export function useMandate() {
  const context = useContext(MandateContext);
  if (!context) {
    throw new Error("useMandate must be used within a MandateProvider");
  }
  return context;
}
