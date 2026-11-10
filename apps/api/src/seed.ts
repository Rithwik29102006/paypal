import type { Rules } from "@mandate/shared";
import { prisma } from "./db.js";
import { signMandate, verifyMandate, getPublicKeyPem } from "./crypto/signing.js";
import { canonicalJson } from "./crypto/canonical.js";
import { appendReceipt, verifyChain } from "./receipts.js";

export const DEMO_RULES: Rules = {
  currency: "USD",
  monthlyCap: 300,
  perTxCap: 100,
  approvalAbove: 60,
  allowedCategories: ["groceries", "school"],
  allowedMerchants: ["demo-store"],
  blockedKeywords: ["gift card", "crypto", "bitcoin"],
  expiresAt: "2026-12-31T23:59:59Z",
};

export async function seedMandateDemo() {
  const existing = await prisma.mandate.findUnique({
    where: { id: "mdt_demo" },
  });

  if (existing) {
    let isValidSignature = false;
    try {
      const parsedRules = JSON.parse(existing.rulesJson) as Rules;
      isValidSignature = verifyMandate({
        rules: parsedRules,
        id: existing.id,
        createdAt: existing.createdAt.toISOString(),
        signature: existing.signature,
        publicKey: existing.publicKey,
      });
    } catch {
      isValidSignature = false;
    }

    const chainResult = await verifyChain("mdt_demo");

    if (isValidSignature && chainResult.ok) {
      console.log("Mandate mdt_demo already exists with valid signature and unbroken chain. Keeping.");
      return;
    }

    console.log("Existing mdt_demo has invalid signature or broken chain. Recreating...");
    // Clean up dependent records before recreating
    await prisma.receipt.deleteMany({ where: { mandateId: "mdt_demo" } });
    await prisma.approval.deleteMany({ where: { cart: { mandateId: "mdt_demo" } } });
    await prisma.payment.deleteMany({ where: { mandateId: "mdt_demo" } });
    await prisma.cart.deleteMany({ where: { mandateId: "mdt_demo" } });
    await prisma.mandate.delete({ where: { id: "mdt_demo" } });
  }

  const createdAt = "2026-01-01T00:00:00.000Z";
  const signature = signMandate(DEMO_RULES, "mdt_demo", createdAt);
  const publicKey = getPublicKeyPem();

  await prisma.mandate.create({
    data: {
      id: "mdt_demo",
      userId: "anita",
      rulesJson: canonicalJson(DEMO_RULES),
      signature,
      publicKey,
      vaultId: null,
      status: "active",
      spentThisMonth: 0,
      createdAt: new Date(createdAt),
    },
  });

  await appendReceipt("mdt_demo", "mandate_created", {
    mandateId: "mdt_demo",
    userId: "anita",
    rules: DEMO_RULES,
    createdAt,
  });

  console.log("Seeded mandate mdt_demo for user anita with valid Ed25519 signature and receipt chain.");
}

seedMandateDemo()
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
