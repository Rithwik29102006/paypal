import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { config } from "./config.js";

/**
 * OpenRouter speaks the OpenAI Chat Completions API, so we reuse the OpenAI
 * provider with OpenRouter's base URL. `.chat()` forces Chat Completions
 * (OpenRouter does not serve OpenAI's Responses API for every model).
 */
const openrouter = createOpenAI({
  baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: {
    "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "https://github.com/Rithwik29102006/paypal",
    "X-Title": "Mandate",
  },
});

/** "claude-sonnet-5-5" -> "anthropic/claude-sonnet-5.5", so Anthropic-style ids still work on OpenRouter. */
export function toOpenRouterId(id: string): string {
  if (id.includes("/")) return id;
  if (id.startsWith("claude-")) return "anthropic/" + id.replace(/-(\d+)-(\d+)$/, "-$1.$2");
  return id;
}

/** Returns an AI SDK language model for the configured provider. */
export function model(id: string) {
  switch (config.llmProvider) {
    case "openrouter":
      return openrouter.chat(toOpenRouterId(id));
    case "openai":
      return openai(id);
    default:
      return anthropic(id);
  }
}
