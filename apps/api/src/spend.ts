import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "./db.js";

/**
 * Returns the sum of captured payments for a mandate in the current calendar month (UTC), in cents.
 */
export async function getSpentThisMonthCents(
  mandateId: string,
  now: Date = new Date(),
  client: PrismaClient = defaultPrisma
): Promise<number> {
  const startOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
  );

  const payments = await client.payment.findMany({
    where: {
      mandateId,
      status: "captured",
      createdAt: { gte: startOfMonth },
    },
    select: { amountCents: true },
  });

  return payments.reduce((sum, p) => sum + p.amountCents, 0);
}
