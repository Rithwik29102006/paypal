import { RiskReport, type DetectRequest } from "@mandate/shared";
import { config } from "./config.js";

export type DetectorResult =
  | { ok: true; report: RiskReport }
  | { ok: false; error: string };

export type DetectorClient = (req: DetectRequest) => Promise<DetectorResult>;

/**
 * Calls the detector service at DETECTOR_URL/detect with a 5-second timeout.
 * Never throws, no retries. Returns {ok:true, report} or {ok:false, error}.
 */
export async function callDetector(req: DetectRequest): Promise<DetectorResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${config.DETECTOR_URL}/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        ok: false,
        error: `Detector service responded with status ${res.status}`,
      };
    }

    const json = await res.json();
    const parseResult = RiskReport.safeParse(json);
    if (!parseResult.success) {
      return {
        ok: false,
        error: `Invalid detector response format: ${parseResult.error.message}`,
      };
    }

    return {
      ok: true,
      report: parseResult.data,
    };
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : "Unknown error calling detector";
    return {
      ok: false,
      error: `Detector unavailable or timed out: ${msg}`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
