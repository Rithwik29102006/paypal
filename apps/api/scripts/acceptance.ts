import http from "node:http";
import { fork, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/db.js";
import { seedMandateDemo } from "../src/seed.js";
import { verifyChain } from "../src/receipts.js";
import { buildServer } from "../src/server.js";
import { getSpentThisMonthCents } from "../src/spend.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== PHASE 4 LIVE ACCEPTANCE TEST ===");

  // 0. Seed mandate mdt_demo
  console.log("\n[0] Resetting and seeding database for mdt_demo...");
  await prisma.receipt.deleteMany({ where: { mandateId: "mdt_demo" } });
  await prisma.approval.deleteMany({ where: { cart: { mandateId: "mdt_demo" } } });
  await prisma.payment.deleteMany({ where: { mandateId: "mdt_demo" } });
  await prisma.cart.deleteMany({ where: { mandateId: "mdt_demo" } });
  await prisma.mandate.deleteMany({ where: { id: "mdt_demo" } });
  await seedMandateDemo();

  // 1. Start detector server on port 4100
  console.log("\n[1] Starting detector server on port 4100...");
  const tsxCli = path.resolve(REPO_ROOT, "node_modules/.pnpm/tsx@4.23.15/node_modules/tsx/dist/cli.mjs");
  const detectorProcess = spawn(
    process.execPath,
    [tsxCli, "apps/agent/src/server.ts"],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, AGENT_PORT: "4100" },
      stdio: "pipe",
    }
  );

  detectorProcess.stdout.on("data", (d) => console.log("[detector stdout]", d.toString().trim()));
  detectorProcess.stderr.on("data", (d) => console.error("[detector stderr]", d.toString().trim()));

  // Give detector a moment to start
  let detectorReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:4100/health");
      if (res.ok) {
        detectorReady = true;
        break;
      }
    } catch (e: any) {
      if (i % 5 === 0) console.log(`[attempt ${i}] Fetch error:`, e.message || e);
      await wait(300);
    }
  }

  if (!detectorReady) {
    console.error("Detector server failed to start within 9s");
    detectorProcess.kill();
    process.exit(1);
  }
  console.log("Detector server ready at http://localhost:4100");

  // 2. Start Mandate API server on port 4000
  console.log("\n[2] Starting Mandate API on port 4000...");
  const server = await buildServer();
  await server.listen({ port: 4000, host: "0.0.0.0" });
  console.log("Mandate API listening at http://localhost:4000");

  // 3. Connect to SSE stream
  console.log("\n[3] Connecting to SSE stream at http://localhost:4000/events...");
  const sseEvents: any[] = [];
  const sseReq = http.get("http://localhost:4000/events", (res) => {
    let buffer = "";
    res.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            sseEvents.push(data);
          } catch {}
        }
      }
    });
  });

  await wait(500); // Allow SSE connection to establish

  try {
    // Step 1: Check $5 grocery -> allow
    console.log("\n--- Step 1: Check $5 grocery cart ---");
    const checkRes1 = await fetch("http://localhost:4000/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mandateId: "mdt_demo",
        cart: {
          items: [
            {
              sku: "GRO-MILK",
              name: "Milk",
              category: "groceries",
              merchant: "demo-store",
              unitPrice: 5,
              qty: 1,
            },
          ],
          total: 5,
          agentReasoning: "Buying milk for this week",
        },
        userRequest: "Buy milk for this week",
        pageText: "Demo store grocery catalog",
      }),
    });

    const checkData1 = await checkRes1.json();
    console.log("POST /check response:", checkData1);
    if (checkData1.decision !== "allow") {
      throw new Error(`Expected decision "allow", got ${checkData1.decision}`);
    }
    const cartId5 = checkData1.cartId;

    // Step 2: Pay $5 cart -> captured, verify payment receipt
    console.log("\n--- Step 2: Pay $5 cart ---");
    const payRes1 = await fetch("http://localhost:4000/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartId: cartId5 }),
    });
    const payData1 = await payRes1.json();
    console.log("POST /pay response:", payData1);
    if (payData1.status !== "captured") {
      throw new Error(`Expected payment status "captured", got ${payData1.status}`);
    }

    const receiptsRes1 = await fetch("http://localhost:4000/receipts?mandateId=mdt_demo");
    const receipts1 = await receiptsRes1.json();
    const paymentReceipt1 = receipts1.find((r: any) => r.type === "payment");
    console.log("Payment receipt found:", paymentReceipt1);
    if (!paymentReceipt1) {
      throw new Error("Payment receipt not found in chain");
    }

    // Step 3: Check spentThisMonth reflects $5
    console.log("\n--- Step 3: Check spentThisMonth ---");
    const mandateRes1 = await fetch("http://localhost:4000/mandates/mdt_demo");
    const mandateData1 = await mandateRes1.json();
    console.log("GET /mandates/mdt_demo spentThisMonth:", mandateData1.spentThisMonth);
    if (mandateData1.spentThisMonth !== 5) {
      throw new Error(`Expected spentThisMonth 5, got ${mandateData1.spentThisMonth}`);
    }

    // Step 4: Check dem0-store -> blocked
    console.log("\n--- Step 4: Check look-alike dem0-store cart ---");
    const checkRes2 = await fetch("http://localhost:4000/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mandateId: "mdt_demo",
        cart: {
          items: [
            {
              sku: "GRO-MILK-FAKE",
              name: "Phishing Milk",
              category: "groceries",
              merchant: "dem0-store",
              unitPrice: 5,
              qty: 1,
            },
          ],
          total: 5,
          agentReasoning: "Buying milk from fake store",
        },
        userRequest: "Buy milk from fake store",
        pageText: "Fake look-alike store",
      }),
    });
    const checkData2 = await checkRes2.json();
    console.log("POST /check response:", checkData2);
    if (checkData2.decision !== "block") {
      throw new Error(`Expected decision "block", got ${checkData2.decision}`);
    }
    const cartIdBlocked = checkData2.cartId;

    // Step 5: Try to pay dem0-store cart -> 403
    console.log("\n--- Step 5: Try to pay blocked cart ---");
    const payRes2 = await fetch("http://localhost:4000/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartId: cartIdBlocked }),
    });
    console.log("POST /pay status:", payRes2.status);
    const payData2 = await payRes2.json();
    console.log("POST /pay body:", payData2);
    if (payRes2.status !== 403) {
      throw new Error(`Expected status 403, got ${payRes2.status}`);
    }

    // Step 6: Pay $5 cart again -> 200 idempotent, exactly 1 payment row
    console.log("\n--- Step 6: Pay $5 cart again (idempotent) ---");
    const payRes3 = await fetch("http://localhost:4000/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartId: cartId5 }),
    });
    console.log("POST /pay status:", payRes3.status);
    const payData3 = await payRes3.json();
    console.log("POST /pay body:", payData3);
    if (payRes3.status !== 200 || payData3.status !== "captured") {
      throw new Error(`Expected 200 captured, got ${payRes3.status} ${payData3.status}`);
    }

    const paymentRows = await prisma.payment.findMany({
      where: { cartId: cartId5 },
    });
    console.log(`Payment rows for cart ${cartId5}:`, paymentRows.length);
    if (paymentRows.length !== 1) {
      throw new Error(`Expected exactly 1 payment row, got ${paymentRows.length}`);
    }

    // Step 7: Check $75 grocery -> needs_approval
    console.log("\n--- Step 7: Check $75 grocery cart (> $60 approval limit) ---");
    const checkRes4 = await fetch("http://localhost:4000/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mandateId: "mdt_demo",
        cart: {
          items: [
            {
              sku: "GRO-BULK",
              name: "Bulk Groceries",
              category: "groceries",
              merchant: "demo-store",
              unitPrice: 75,
              qty: 1,
            },
          ],
          total: 75,
          agentReasoning: "Buying bulk groceries for family",
        },
        userRequest: "Buy bulk groceries for family",
        pageText: "Demo store bulk section",
      }),
    });
    const checkData4 = await checkRes4.json();
    console.log("POST /check response:", checkData4);
    if (checkData4.decision !== "needs_approval") {
      throw new Error(`Expected decision "needs_approval", got ${checkData4.decision}`);
    }
    const cartId75 = checkData4.cartId;
    const approvalId = checkData4.approvalId;
    console.log("Approval created with ID:", approvalId);

    // Step 8: Approve it via POST /approvals/:id/decision
    console.log("\n--- Step 8: Approve via POST /approvals/:id/decision ---");
    const appRes = await fetch(`http://localhost:4000/approvals/${approvalId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved: true }),
    });
    const appData = await appRes.json();
    console.log("Approval decision response:", appData);
    if (appData.status !== "approved") {
      throw new Error(`Expected approval status "approved", got ${appData.status}`);
    }

    // Step 9: Pay $75 cart -> captured
    console.log("\n--- Step 9: Pay $75 approved cart ---");
    const payRes5 = await fetch("http://localhost:4000/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartId: cartId75 }),
    });
    const payData5 = await payRes5.json();
    console.log("POST /pay response:", payData5);
    if (payData5.status !== "captured") {
      throw new Error(`Expected payment status "captured", got ${payData5.status}`);
    }

    // Step 10: Verify receipts chain is intact (verifyChain)
    console.log("\n--- Step 10: Verify receipts chain ---");
    const verifyRes = await fetch("http://localhost:4000/receipts/verify?mandateId=mdt_demo");
    const verifyData = await verifyRes.json();
    console.log("GET /receipts/verify response:", verifyData);
    if (!verifyData.ok || verifyData.brokenSeq !== null) {
      throw new Error(`Chain verification failed: ${JSON.stringify(verifyData)}`);
    }

    // Step 11: Check SSE stream received live payment events
    console.log("\n--- Step 11: Check SSE events received ---");
    await wait(300); // Flush buffer
    console.log(`Total SSE events collected: ${sseEvents.length}`);
    const paymentEvents = sseEvents.filter((e) => e.type === "payment");
    console.log("SSE payment events:", paymentEvents);
    if (paymentEvents.length < 2) {
      throw new Error(`Expected at least 2 payment events on SSE stream, received ${paymentEvents.length}`);
    }

    console.log("\n=== ALL 11 ACCEPTANCE STEPS PASSED SUCCESSFULLY ===");

    // Try running apps/agent
    console.log("\n--- Checking apps/agent CLI ---");
    const agentProc = spawn(
      process.execPath,
      [tsxCli, "apps/agent/src/cli.ts", "buy milk"],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          MANDATE_API_URL: "http://localhost:4000",
          MANDATE_ID: "mdt_demo",
        },
        stdio: "pipe",
      }
    );

    let agentOutput = "";
    agentProc.stdout.on("data", (d) => { agentOutput += d.toString(); });
    agentProc.stderr.on("data", (d) => { agentOutput += d.toString(); });

    await new Promise<void>((resolve) => {
      agentProc.on("close", (code) => {
        console.log(`apps/agent exit code: ${code}`);
        console.log("apps/agent output:", agentOutput.trim());
        resolve();
      });
    });

  } finally {
    sseReq.destroy();
    await server.close();
    detectorProcess.kill();
  }
}

main().catch((err) => {
  console.error("Acceptance test failed:", err);
  process.exit(1);
});
