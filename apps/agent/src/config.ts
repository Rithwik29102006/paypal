/**
 * One place for every knob Member 1 owns. Read from environment variables so
 * the same code runs locally, in tests and on Render.
 */
import "dotenv/config";

function num(name: string, fallback: number): number {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : Number(v);
}

export type LlmProvider = "anthropic" | "openai" | "openrouter";

/** LLM_PROVIDER wins; otherwise pick the provider whose key is set (Anthropic first). */
function pickProvider(): LlmProvider {
  const p = process.env.LLM_PROVIDER;
  if (p === "anthropic" || p === "openai" || p === "openrouter") return p;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "anthropic";
}

const llmProvider = pickProvider();

/** Default model ids per provider (OpenRouter uses "vendor/model" slugs). */
const DEFAULT_MODELS: Record<LlmProvider, { agent: string; detector: string }> = {
  anthropic: { agent: "claude-sonnet-5-5", detector: "claude-haiku-5-5" },
  openrouter: { agent: "anthropic/claude-sonnet-5.5", detector: "anthropic/claude-haiku-5.5" },
  openai: { agent: "gpt-5", detector: "gpt-5-mini" },
};

export const config = {
  /** "anthropic", "openai" or "openrouter" */
  llmProvider,
  /** Model for the shopping agent. Pin it here so the whole team uses the same one. */
  agentModel: process.env.AGENT_MODEL || DEFAULT_MODELS[llmProvider].agent,
  /** Smaller, faster model for the trick detector's LLM judge. */
  detectorModel: process.env.DETECTOR_MODEL || DEFAULT_MODELS[llmProvider].detector,
  /** Set DETECTOR_LLM=off to run the detector with rules only (offline, CI). */
  detectorLlm: (process.env.DETECTOR_LLM ?? "auto") as "auto" | "off",

  /** Risk at or above this blocks the cart. */
  blockAt: num("RISK_BLOCK_AT", 0.7),
  /** Risk at or above this (and below blockAt) asks the user. */
  reviewAt: num("RISK_REVIEW_AT", 0.4),

  /** Member 2's Mandate API. When MOCK_API=1 the agent uses src/mockApi.ts instead. */
  apiUrl: process.env.MANDATE_API_URL ?? "http://localhost:4000",
  mockApi: process.env.MOCK_API === "1",
  /** Mandate the agent shops under. */
  mandateId: process.env.MANDATE_ID ?? "mdt_demo",

  /** Merchants we know; anything one or two letters away is a lookalike. */
  knownMerchants: (process.env.KNOWN_MERCHANTS ?? "demo-store").split(","),

  /** HTTP server port for apps/agent (detector + agent endpoints). */
  port: num("AGENT_PORT", 4100),
  /** How long the agent waits for Anita to approve a held cart. */
  approvalTimeoutMs: num("APPROVAL_TIMEOUT_MS", 120_000),
};

const KEY_VAR: Record<LlmProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

/** Name of the env var holding the key for the active provider. */
export function llmKeyVar(): string {
  return KEY_VAR[config.llmProvider];
}

export function llmConfigured(): boolean {
  return Boolean(process.env[llmKeyVar()]);
}
