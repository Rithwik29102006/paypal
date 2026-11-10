/**
 * One place for every knob Member 1 owns. Read from environment variables so
 * the same code runs locally, in tests and on Render.
 */
import "dotenv/config";

function num(name: string, fallback: number): number {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : Number(v);
}

export const config = {
  /** "anthropic" or "openai" */
  llmProvider: (process.env.LLM_PROVIDER ?? "anthropic") as "anthropic" | "openai",
  /** Model for the shopping agent. Pin it here so the whole team uses the same one. */
  agentModel: process.env.AGENT_MODEL ?? "claude-sonnet-5-5",
  /** Smaller, faster model for the trick detector's LLM judge. */
  detectorModel: process.env.DETECTOR_MODEL ?? "claude-haiku-5-5",
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

export function llmConfigured(): boolean {
  return config.llmProvider === "openai"
    ? Boolean(process.env.OPENAI_API_KEY)
    : Boolean(process.env.ANTHROPIC_API_KEY);
}
