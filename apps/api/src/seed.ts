import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_RULES = {
  currency: "USD",
  monthlyCap: 300,
  perTxCap: 100,
  approvalAbove: 60,
  allowedCategories: ["groceries", "school"],
  allowedMerchants: ["demo-store"],
  blockedKeywords: ["gift card", "crypto", "bitcoin"],
  expiresAt: "2026-12-31T23:59:59Z",
};

async function seed() {
  console.log("Seeding database...");
  await prisma.mandate.upsert({
    where: { id: "mdt_demo" },
    update: {},
    create: {
      id: "mdt_demo",
      userId: "anita",
      rulesJson: JSON.stringify(DEMO_RULES),
      signature: "sig_demo",
      publicKey: "pk_demo",
      vaultId: null,
      status: "active",
      spentThisMonth: 0,
    },
  });
  console.log("Seeded mandate mdt_demo for user anita.");
}

seed()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
