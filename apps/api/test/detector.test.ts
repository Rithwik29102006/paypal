import { describe, it, expect, vi, afterEach } from "vitest";
import { callDetector } from "../src/detector.js";
import type { DetectRequest } from "@mandate/shared";

const sampleRequest: DetectRequest = {
  userRequest: "Buy apples",
  cart: {
    items: [
      {
        sku: "apple-1",
        name: "Apple",
        category: "groceries",
        unitPrice: 2,
        qty: 1,
        merchant: "demo-store",
      },
    ],
    total: 2,
    agentReasoning: "apples",
    sourceUrls: [],
  },
  pageText: "Store page",
};

describe("Detector client callDetector", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns report on successful 200 response with valid RiskReport", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          riskScore: 0.15,
          signals: ["safe item"],
          verdict: "safe",
        }),
        { status: 200 }
      )
    );

    const result = await callDetector(sampleRequest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.riskScore).toBe(0.15);
      expect(result.report.verdict).toBe("safe");
    }
  });

  it("returns {ok: false, error} when detector returns 500 without throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 })
    );

    const result = await callDetector(sampleRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("500");
    }
  });

  it("returns {ok: false, error} when detector network fails or times out without throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("fetch failed connection refused")
    );

    const result = await callDetector(sampleRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("connection refused");
    }
  });
});
