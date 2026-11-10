import { prisma } from "./db.js";

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Tamper script is disabled in production!");
    process.exit(1);
  }

  const seqArg = process.argv[2] ?? "1";
  const seq = parseInt(seqArg, 10);
  if (isNaN(seq) || seq <= 0) {
    console.error(`Invalid sequence number: "${seqArg}"`);
    process.exit(1);
  }

  const mandateId = process.argv[3] ?? "mdt_demo";

  const receipt = await prisma.receipt.findUnique({
    where: {
      mandateId_seq: { mandateId, seq },
    },
  });

  if (!receipt) {
    console.error(`Receipt with seq ${seq} not found for mandate "${mandateId}"`);
    process.exit(1);
  }

  const tamperedPayload = JSON.stringify({
    tampered: true,
    original: receipt.payload,
    tamperedAt: new Date().toISOString(),
  });

  await prisma.receipt.update({
    where: { id: receipt.id },
    data: { payload: tamperedPayload },
  });

  console.log(`Tampered receipt seq ${seq} for mandate "${mandateId}". Payload modified.`);
}

main()
  .catch((err) => {
    console.error("Tamper error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
