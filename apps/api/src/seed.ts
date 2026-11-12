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

/** Kid's allowance: Anita's 15-year-old Sam has his own agent with a much smaller permission slip. */
export const TEEN_RULES: Rules = {
  currency: "USD",
  monthlyCap: 40,
  perTxCap: 15,
  approvalAbove: 10,
  allowedCategories: ["school", "groceries"],
  allowedMerchants: ["demo-store"],
  blockedKeywords: ["gift card", "crypto", "bitcoin", "energy drink"],
  expiresAt: "2026-12-31T23:59:59Z",
};

export async function seedMandateDemo() {
  await seedMandate("mdt_demo", "anita", DEMO_RULES);
  await seedMandate("mdt_teen", "sam", TEEN_RULES);
}

async function seedMandate(id: string, userId: string, rules: Rules) {
  const existing = await prisma.mandate.findUnique({
    where: { id },
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

    const chainResult = await verifyChain(id);

    if (isValidSignature && chainResult.ok) {
      console.log(`Mandate ${id} already exists with valid signature and unbroken chain. Keeping.`);
      return;
    }

    console.log(`Existing ${id} has invalid signature or broken chain. Recreating...`);
    // Clean up dependent records before recreating
    await prisma.receipt.deleteMany({ where: { mandateId: id } });
    await prisma.approval.deleteMany({ where: { cart: { mandateId: id } } });
    await prisma.payment.deleteMany({ where: { mandateId: id } });
    await prisma.cart.deleteMany({ where: { mandateId: id } });
    await prisma.mandate.delete({ where: { id: id } });
  }

  const createdAt = "2026-01-01T00:00:00.000Z";
  const signature = signMandate(rules, id, createdAt);
  const publicKey = getPublicKeyPem();

  await prisma.mandate.create({
    data: {
      id: id,
      userId,
      rulesJson: canonicalJson(rules),
      signature,
      publicKey,
      setupTokenId: `MOCK-SETUP-${id}`,
      vaultId: null,
      status: "active",
      spentThisMonth: 0,
      createdAt: new Date(createdAt),
    },
  });

  await appendReceipt(id, "mandate_created", {
    mandateId: id,
    userId,
    rules: rules,
    createdAt,
  });

  console.log(`Seeded mandate ${id} for user ${userId} with valid Ed25519 signature and receipt chain.`);
}

if (process.argv[1]?.includes("seed")) {
  seedMandateDemo()
    .catch((err) => {
      console.error("Seed error:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
