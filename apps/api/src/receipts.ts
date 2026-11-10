import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "./db.js";
import { canonicalJson } from "./crypto/canonical.js";

export const GENESIS_PREV_HASH = "0".repeat(64);

class AsyncLock {
  private queue: Promise<unknown> = Promise.resolve();

  async acquire<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(() => fn());
    this.queue = result.catch(() => {});
    return result;
  }
}

const locks = new Map<string, AsyncLock>();

function getLock(mandateId: string): AsyncLock {
  let lock = locks.get(mandateId);
  if (!lock) {
    lock = new AsyncLock();
    locks.set(mandateId, lock);
  }
  return lock;
}

/**
 * Appends a receipt to the hash-chain for a given mandate.
 * Appends are serialized per mandate and wrapped in a Prisma transaction
 * with retry on conflict / busy.
 */
export async function appendReceipt(
  mandateId: string,
  type: string,
  payload: unknown,
  client: PrismaClient = defaultPrisma
) {
  const canonicalPayload =
    typeof payload === "string"
      ? canonicalJson(JSON.parse(payload))
      : canonicalJson(payload);

  const lock = getLock(mandateId);

  return lock.acquire(async () => {
    const MAX_RETRIES = 50;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await client.$transaction(
          async (tx) => {
            const latest = await tx.receipt.findFirst({
              where: { mandateId },
              orderBy: { seq: "desc" },
            });

            const nextSeq = latest ? latest.seq + 1 : 1;
            const prevHash = latest ? latest.hash : GENESIS_PREV_HASH;
            const createdAt = new Date();
            const createdAtIso = createdAt.toISOString();

            const hashInput =
              prevHash +
              canonicalJson({
                createdAt: createdAtIso,
                payload: canonicalPayload,
                seq: nextSeq,
                type,
              });

            const hash = crypto
              .createHash("sha256")
              .update(hashInput)
              .digest("hex");

            return await tx.receipt.create({
              data: {
                mandateId,
                seq: nextSeq,
                type,
                payload: canonicalPayload,
                prevHash,
                hash,
                createdAt,
              },
            });
          },
          {
            timeout: 10000,
            maxWait: 5000,
          }
        );
      } catch (err: unknown) {
        const isConflictOrBusy =
          err &&
          typeof err === "object" &&
          (("code" in err &&
            (err.code === "P2002" || err.code === "P2034" || err.code === "P2028")) ||
            ("message" in err &&
              typeof err.message === "string" &&
              (err.message.includes("locked") ||
                err.message.includes("busy") ||
                err.message.includes("unique") ||
                err.message.includes("conflict"))));

        if (isConflictOrBusy && attempt < MAX_RETRIES - 1) {
          const delay = Math.min(200, 10 + Math.random() * (10 + attempt * 10));
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw err;
      }
    }

    throw new Error(
      `Failed to append receipt for mandate ${mandateId} after ${MAX_RETRIES} attempts`
    );
  });
}

/**
 * Recomputes and verifies the hash chain for all receipts belonging to a mandate.
 */
export async function verifyChain(
  mandateId: string,
  client: PrismaClient = defaultPrisma
): Promise<{
  ok: boolean;
  brokenSeq?: number;
  checked: number;
}> {
  const receipts = await client.receipt.findMany({
    where: { mandateId },
    orderBy: { seq: "asc" },
  });

  if (receipts.length === 0) {
    return { ok: true, checked: 0 };
  }

  let expectedSeq = 1;
  let expectedPrevHash = GENESIS_PREV_HASH;
  let checked = 0;

  for (const r of receipts) {
    // Gap check in sequence
    if (r.seq !== expectedSeq) {
      return { ok: false, brokenSeq: expectedSeq, checked };
    }

    // Previous hash link check
    if (r.prevHash !== expectedPrevHash) {
      return { ok: false, brokenSeq: r.seq, checked };
    }

    // Recompute hash
    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(r.payload);
    } catch {
      return { ok: false, brokenSeq: r.seq, checked };
    }

    const canonicalPayload = canonicalJson(parsedPayload);
    const hashInput =
      r.prevHash +
      canonicalJson({
        createdAt: r.createdAt.toISOString(),
        payload: canonicalPayload,
        seq: r.seq,
        type: r.type,
      });

    const recomputedHash = crypto
      .createHash("sha256")
      .update(hashInput)
      .digest("hex");

    if (recomputedHash !== r.hash) {
      return { ok: false, brokenSeq: r.seq, checked };
    }

    expectedPrevHash = r.hash;
    expectedSeq++;
    checked++;
  }

  return { ok: true, checked };
}
