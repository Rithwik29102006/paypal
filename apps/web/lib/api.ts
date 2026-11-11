/**
 * Thin client for Member 2's Mandate API (apps/api) and Member 1's agent
 * server (apps/agent). Types come from @mandate/shared.
 */
import type { DisputeView, LiveEventV2, Rules } from "@mandate/shared";
import type { Receipt } from "./receipts";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");
export const AGENT_URL = (process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:4100").replace(/\/$/, "");
export const DEFAULT_MANDATE_ID = process.env.NEXT_PUBLIC_MANDATE_ID || "mdt_demo";

export class ApiError extends Error {
  constructor(message: string, public status: number, public reasons?: string[]) {
    super(message);
  }
}

async function call<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(json.error ?? `${path} failed (${res.status})`, res.status, json.reasons);
  return json as T;
}

export async function isUp(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------- Mandates ----------

export interface ApiMandate {
  id: string;
  userId: string;
  rules: Rules;
  signature: string;
  publicKey: string;
  vaultId: string | null;
  status: "active" | "paused" | "revoked";
  createdAt: string;
  spentThisMonth?: number;
}

export const getMandate = (id: string) => call<ApiMandate>(API_URL, `/mandates/${encodeURIComponent(id)}`);

export const createMandate = (userId: string, rules: Rules) =>
  call<{ mandate: ApiMandate; approveUrl: string | null }>(API_URL, "/mandates", {
    method: "POST",
    body: JSON.stringify({ userId, rules }),
  });

export const completeVault = (id: string) =>
  call<ApiMandate>(API_URL, `/mandates/${encodeURIComponent(id)}/vault/complete`, { method: "POST" });

// ---------- Approvals ----------

/** Emergency stop: while paused, Mandate rejects every cart. */
export const setMandatePaused = (id: string, paused: boolean) =>
  call<{ id: string; status: "active" | "paused" }>(API_URL, `/mandates/${encodeURIComponent(id)}/${paused ? "pause" : "resume"}`, { method: "POST" });

export const decideApproval = (id: string, approved: boolean) =>
  call<{ id: string; status: string }>(API_URL, `/approvals/${encodeURIComponent(id)}`, {
    method: "POST",
    body: JSON.stringify({ approved }),
  });

// ---------- Payments ----------

/** POST /pay again for a cart: captures an order the buyer has just approved in PayPal (idempotent). */
export const payCart = (cartId: string) =>
  call<{ paymentId: string; paypalOrderId: string; captureId: string | null; status: string; approveUrl?: string }>(API_URL, "/pay", {
    method: "POST",
    body: JSON.stringify({ cartId }),
  });

// ---------- Receipts ----------

interface ApiReceipt {
  seq: number;
  type: string;
  payload: string;
  prevHash: string;
  hash: string;
  createdAt: string;
}

/** Maps API receipts (payload as JSON string, cents) to the dashboard's shape. */
export async function getReceipts(mandateId: string): Promise<Receipt[]> {
  const rows = await call<ApiReceipt[]>(API_URL, `/receipts?mandateId=${encodeURIComponent(mandateId)}`);
  return rows.map((r) => {
    let payload: Record<string, any> = {};
    try {
      payload = JSON.parse(r.payload);
    } catch {
      payload = { raw: r.payload };
    }
    if (typeof payload.amountCents === "number" && payload.amount === undefined) payload.amount = (payload.amountCents / 100).toFixed(2);
    if (r.type.startsWith("mandate") && !payload.mandateId) payload.mandateId = mandateId;
    return { seq: r.seq, type: r.type as Receipt["type"], payload, prevHash: r.prevHash, hash: r.hash, createdAt: r.createdAt, tampered: payload.tampered === true };
  });
}

export const verifyReceipts = (mandateId: string) =>
  call<{ ok: boolean; brokenSeq?: number | null; checked: number }>(API_URL, `/receipts/verify?mandateId=${encodeURIComponent(mandateId)}`);

// ---------- Disputes ----------

export const getDisputes = () => call<DisputeView[]>(API_URL, "/disputes");
export const defendDispute = (id: string) => call<DisputeView>(API_URL, `/disputes/${id}/defend`, { method: "POST" });
export const sandboxResolve = (id: string, outcome: "won" | "lost") =>
  call<DisputeView>(API_URL, `/disputes/${id}/sandbox-resolve`, { method: "POST", body: JSON.stringify({ outcome }) });
export const evidencePdfUrl = (id: string) => `${API_URL}/disputes/${id}/evidence.pdf`;

// ---------- Live events ----------

export function subscribeEvents(onEvent: (e: LiveEventV2) => void, onStatus: (open: boolean) => void): () => void {
  const es = new EventSource(`${API_URL}/events`);
  es.onopen = () => onStatus(true);
  es.onerror = () => onStatus(false); // EventSource reconnects by itself
  es.onmessage = (m) => {
    try {
      onEvent(JSON.parse(m.data) as LiveEventV2);
    } catch {
      /* ignore malformed lines */
    }
  };
  return () => es.close();
}

// ---------- Agent ----------

export interface AgentStreamEvent {
  type: string;
  approveUrl?: string;
  summary?: string;
  text?: string;
  at?: string;
  cartId?: string;
  decision?: string;
}

/** Runs the agent with streaming progress (POST /agent/run?stream=1). Resolves with the agent's final text. */
export async function runAgent(request: string, mandateId: string, onProgress: (e: AgentStreamEvent) => void): Promise<string> {
  const res = await fetch(`${AGENT_URL}/agent/run?stream=1`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ request, mandateId }),
  });
  if (!res.ok || !res.body) throw new ApiError(`agent failed (${res.status})`, res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalText = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const ev = JSON.parse(line.slice(5)) as AgentStreamEvent;
      if (ev.type === "result") finalText = ev.text ?? "";
      else if (ev.type === "error") throw new ApiError(ev.summary ?? "agent error", 500);
      else onProgress(ev);
    }
  }
  return finalText;
}
