import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { config } from "./config.js";

/** Returns an AI SDK language model for the configured provider. */
export function model(id: string) {
  return config.llmProvider === "openai" ? openai(id) : anthropic(id);
}
