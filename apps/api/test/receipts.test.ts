import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/db.js";
import { appendReceipt, verifyChain } from "../src/receipts.js";
import { canonicalJson } from "../src/crypto/canonical.js";

describe("Receipt chain", () => {
  const mandateId = "mdt_receipts_test";

  beforeAll(async () => {
    // Ensure test mandate exists in DB for foreign key constraint
    await prisma.receipt.deleteMany({ where: { mandateId } });
    await prisma.mandate.deleteMany({ where: { id: mandateId } });

    await prisma.mandate.create({
      data: {
        id: mandateId,
        userId: "test_user",
        rulesJson: canonicalJson({ currency: "USD" }),
        signature: "sig",
        publicKey: "pk",
        status: "active",
      },
    });
  });

  afterAll(async () => {
    await prisma.receipt.deleteMany({ where: { mandateId } });
    await prisma.mandate.deleteMany({ where: { id: mandateId } });
    await prisma.$disconnect();
  });

  it("handles 20 concurrent appends producing seq 1..20 with a valid hash chain", async () => {
    const promises = Array.from({ length: 20 }, (_, i) =>
      appendReceipt(mandateId, "check", { index: i, note: `receipt-${i}` })
    );

    const results = await Promise.all(promises);
    expect(results).toHaveLength(20);

    const receipts = await prisma.receipt.findMany({
      where: { mandateId },
      orderBy: { seq: "asc" },
    });

    expect(receipts).toHaveLength(20);

    // Verify sequences are strictly 1..20
    const seqs = receipts.map((r) => r.seq);
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));

    // Verify chain integrity
    const chain = await verifyChain(mandateId);
    expect(chain.ok).toBe(true);
    expect(chain.checked).toBe(20);
    expect(chain.brokenSeq).toBeUndefined();
  });

  it("detects an edited payload and reports the exact broken sequence", async () => {
    // Tamper with seq 5
    const target = await prisma.receipt.findUnique({
      where: { mandateId_seq: { mandateId, seq: 5 } },
    });
    expect(target).toBeDefined();

    await prisma.receipt.update({
      where: { id: target!.id },
      data: { payload: '{"tampered":true}' },
    });

    const chain = await verifyChain(mandateId);
    expect(chain.ok).toBe(false);
    expect(chain.brokenSeq).toBe(5);
    expect(chain.checked).toBe(4);

    // Restore payload to original
    await prisma.receipt.update({
      where: { id: target!.id },
      data: { payload: target!.payload },
    });

    const restoredChain = await verifyChain(mandateId);
    expect(restoredChain.ok).toBe(true);
  });

  it("detects a deleted middle row and reports the gap", async () => {
    // Temporarily delete seq 10
    const deleted = await prisma.receipt.findUnique({
      where: { mandateId_seq: { mandateId, seq: 10 } },
    });
    expect(deleted).toBeDefined();

    await prisma.receipt.delete({
      where: { id: deleted!.id },
    });

    const chain = await verifyChain(mandateId);
    expect(chain.ok).toBe(false);
    expect(chain.brokenSeq).toBe(10);
    expect(chain.checked).toBe(9);

    // Re-insert deleted row
    await prisma.receipt.create({
      data: {
        id: deleted!.id,
        mandateId: deleted!.mandateId,
        seq: deleted!.seq,
        type: deleted!.type,
        payload: deleted!.payload,
        prevHash: deleted!.prevHash,
        hash: deleted!.hash,
        createdAt: deleted!.createdAt,
      },
    });

    const restoredChain = await verifyChain(mandateId);
    expect(restoredChain.ok).toBe(true);
  });
});
