/**
 * Hash-chained receipt log and verification.
 * Follows Member 2 specification:
 * hash = sha256(prevHash + canonicalize({ seq, type, payload, createdAt }))
 * Genesis prevHash = "0000000000000000000000000000000000000000000000000000000000000000"
 */

export interface Receipt {
  seq: number;
  type: "mandate_created" | "check" | "approval" | "payment" | "dispute_evidence";
  payload: Record<string, any>;
  prevHash: string;
  hash: string;
  createdAt: string;
  tampered?: boolean;
}

export const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

/** Simple deterministic JSON canonicalization */
export function canonicalize(obj: any): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalize).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k]))
      .join(",") +
    "}"
  );
}

/** Compute SHA-256 hex string using Web Crypto */
export async function sha256(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function computeReceiptHash(
  prevHash: string,
  data: { seq: number; type: string; payload: Record<string, any>; createdAt: string }
): Promise<string> {
  const canonicalData = canonicalize(data);
  return sha256(prevHash + canonicalData);
}

export interface VerificationResult {
  valid: boolean;
  brokenSeq?: number;
  expectedHash?: string;
  actualHash?: string;
  checkedCount: number;
}

export async function verifyReceiptChain(receipts: Receipt[]): Promise<VerificationResult> {
  const sorted = [...receipts].sort((a, b) => a.seq - b.seq);
  let expectedPrev = GENESIS_HASH;

  for (const r of sorted) {
    if (r.prevHash !== expectedPrev) {
      return {
        valid: false,
        brokenSeq: r.seq,
        expectedHash: expectedPrev,
        actualHash: r.prevHash,
        checkedCount: sorted.length,
      };
    }

    const calculated = await computeReceiptHash(r.prevHash, {
      seq: r.seq,
      type: r.type,
      payload: r.payload,
      createdAt: r.createdAt,
    });

    if (calculated !== r.hash) {
      return {
        valid: false,
        brokenSeq: r.seq,
        expectedHash: calculated,
        actualHash: r.hash,
        checkedCount: sorted.length,
      };
    }

    expectedPrev = r.hash;
  }

  return { valid: true, checkedCount: sorted.length };
}

/** Seed demo receipts for Anita's shopping flow */
export async function generateInitialReceipts(): Promise<Receipt[]> {
  const list: Array<Omit<Receipt, "hash" | "prevHash">> = [
    {
      seq: 1,
      type: "mandate_created",
      createdAt: "2026-11-10T10:00:00Z",
      payload: {
        mandateId: "mdt_anita_01",
        userId: "usr_anita_family",
        rules: {
          currency: "USD",
          monthlyCap: 300,
          perTxCap: 100,
          approvalAbove: 60,
          allowedCategories: ["groceries", "school"],
          allowedMerchants: ["demo-store"],
          blockedKeywords: ["gift card", "crypto", "luxury"],
          expiresAt: "2026-12-31T23:59:59Z",
        },
        signature: "ed25519_sig_9f81a7b3c2d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9",
        publicKey: "ed25519_pk_anita_public_key_38472910485729104857291048572910",
        vaultId: "vlt_paypal_anita_saved_token_884920",
      },
    },
    {
      seq: 2,
      type: "check",
      createdAt: "2026-11-10T10:02:15Z",
      payload: {
        cartId: "cart_01_normal",
        decision: "allow",
        reasons: ["All items within allowed categories", "Total under per-purchase limit ($10.47 < $100)"],
        riskScore: 0.05,
        itemsCount: 3,
        total: 10.47,
      },
    },
    {
      seq: 3,
      type: "payment",
      createdAt: "2026-11-10T10:02:18Z",
      payload: {
        paymentId: "pay_01_capt",
        cartId: "cart_01_normal",
        paypalOrderId: "5O190127TN364715T",
        captureId: "3C679366HH908993F",
        amount: 10.47,
        currency: "USD",
        status: "captured",
      },
    },
    {
      seq: 4,
      type: "check",
      createdAt: "2026-11-10T11:15:30Z",
      payload: {
        cartId: "cart_02_attack",
        decision: "block",
        reasons: [
          "Category 'gift_cards' is not in allowedCategories",
          "Total $1000.00 exceeds perTxCap $100.00",
          "Prompt injection detected: hidden CSS on page SCH-BUNDLE pushes gift cards",
        ],
        riskScore: 0.96,
        itemsCount: 11,
        total: 1000.0,
      },
    },
    {
      seq: 5,
      type: "check",
      createdAt: "2026-11-10T12:30:10Z",
      payload: {
        cartId: "cart_03_highvalue",
        decision: "needs_approval",
        reasons: ["Total $79.99 exceeds approvalAbove threshold ($60.00)"],
        riskScore: 0.12,
        approvalId: "appr_772019",
        itemsCount: 2,
        total: 79.99,
      },
    },
    {
      seq: 6,
      type: "approval",
      createdAt: "2026-11-10T12:31:05Z",
      payload: {
        approvalId: "appr_772019",
        cartId: "cart_03_highvalue",
        status: "approved",
        approvedBy: "Anita (Dashboard)",
      },
    },
    {
      seq: 7,
      type: "payment",
      createdAt: "2026-11-10T12:31:10Z",
      payload: {
        paymentId: "pay_03_capt",
        cartId: "cart_03_highvalue",
        paypalOrderId: "8K392817LM293849P",
        captureId: "9X827364AA192837B",
        amount: 79.99,
        currency: "USD",
        status: "captured",
      },
    },
  ];

  const receipts: Receipt[] = [];
  let prevHash = GENESIS_HASH;

  for (const item of list) {
    const hash = await computeReceiptHash(prevHash, {
      seq: item.seq,
      type: item.type,
      payload: item.payload,
      createdAt: item.createdAt,
    });
    receipts.push({
      ...item,
      prevHash,
      hash,
    });
    prevHash = hash;
  }

  return receipts;
}
