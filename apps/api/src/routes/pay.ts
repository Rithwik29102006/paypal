import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { PayRequest, type PayResponse, type Rules } from "@mandate/shared";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { verifyMandate } from "../crypto/signing.js";
import { appendReceipt } from "../receipts.js";
import { getSpentThisMonthCents } from "../spend.js";
import { publish } from "../events.js";
import { getPayPalClient, type PayPalClient } from "../paypal/client.js";
import { MockPayPal } from "../paypal/mock.js";
import { PayPalApiError } from "../paypal/sandbox.js";

class AsyncLock {
  private queue: Promise<unknown> = Promise.resolve();

  async acquire<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(() => fn());
    this.queue = result.catch(() => {});
    return result;
  }
}

const cartLocks = new Map<string, AsyncLock>();

function getCartLock(cartId: string): AsyncLock {
  let lock = cartLocks.get(cartId);
  if (!lock) {
    lock = new AsyncLock();
    cartLocks.set(cartId, lock);
  }
  return lock;
}

export async function payRoutes(
  server: FastifyInstance,
  paypalClient: PayPalClient = getPayPalClient()
) {
  // POST /pay
  server.post("/pay", async (request, reply) => {
    const parseResult = PayRequest.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        reasons: parseResult.error.issues.map(
          (i) => `${i.path.join(".") || "body"}: ${i.message}`
        ),
      });
    }

    const { cartId } = parseResult.data;

    // Look up cart with optional approval
    const cart = await prisma.cart.findUnique({
      where: { id: cartId },
      include: { approval: true },
    });

    if (!cart) {
      return reply.status(404).send({
        error: `Cart "${cartId}" not found`,
      });
    }

    const cartLock = getCartLock(cartId);

    return cartLock.acquire(async () => {
      // 1. Check existing payment for this cart
      const existingPayment = await prisma.payment.findUnique({
        where: { cartId },
      });

      if (existingPayment) {
        if (existingPayment.status === "captured") {
          return reply.status(200).send({
            paymentId: existingPayment.id,
            paypalOrderId: existingPayment.paypalOrderId,
            captureId: existingPayment.captureId,
            status: "captured",
            receiptSeq: existingPayment.receiptSeq ?? undefined,
          } satisfies PayResponse);
        }

        if (existingPayment.status === "failed") {
          return reply.status(502).send({
            error: "Payment previously failed for this cart",
            debugId: existingPayment.paypalOrderId,
          });
        }

        if (existingPayment.status === "created") {
          // Resume capture
          try {
            const capture = await paypalClient.captureOrder(
              existingPayment.paypalOrderId,
              existingPayment.requestId || randomUUID()
            );

            const receipt = await appendReceipt(
              existingPayment.mandateId,
              "payment",
              {
                cartId,
                paymentId: existingPayment.id,
                paypalOrderId: existingPayment.paypalOrderId,
                captureId: capture.captureId,
                amountCents: existingPayment.amountCents,
                status: "captured",
              }
            );

            const updated = await prisma.payment.update({
              where: { id: existingPayment.id },
              data: {
                status: "captured",
                captureId: capture.captureId,
                receiptSeq: receipt.seq,
              },
            });

            const cartReq = JSON.parse(cart.requestJson) as {
              cart: { total: number; items: any[] };
            };

            publish({
              type: "payment",
              mandateId: existingPayment.mandateId,
              cartId,
              items: cartReq.cart.items,
              total: cartReq.cart.total,
              summary: `Payment captured: $${(existingPayment.amountCents / 100).toFixed(2)} (${cartReq.cart.items.length} items)`,
              at: new Date().toISOString(),
            });

            return reply.status(200).send({
              paymentId: updated.id,
              paypalOrderId: updated.paypalOrderId,
              captureId: updated.captureId,
              status: "captured",
              receiptSeq: receipt.seq,
            } satisfies PayResponse);
          } catch (err: unknown) {
            const debugId =
              err instanceof PayPalApiError ? err.debugId : undefined;
            return reply.status(502).send({
              error: "paypal error",
              debugId,
            });
          }
        }
      }

      // 2. Gate check: cart decision must be "allow" OR ("needs_approval" AND approval.status === "approved")
      const isApproved =
        cart.decision === "needs_approval" &&
        cart.approval !== null &&
        cart.approval.status === "approved";

      if (cart.decision !== "allow" && !isApproved) {
        return reply.status(403).send({
          error: "payment not permitted",
          reasons: [
            `cart decision is "${cart.decision}", approval status is "${cart.approval?.status ?? "none"}"`,
          ],
        });
      }

      // 3. Re-validate mandate AT PAY TIME
      const mandate = await prisma.mandate.findUnique({
        where: { id: cart.mandateId },
      });

      if (!mandate) {
        return reply.status(404).send({
          error: `Mandate "${cart.mandateId}" not found`,
        });
      }

      const reasons: string[] = [];
      let parsedRules: Rules;
      try {
        parsedRules = JSON.parse(mandate.rulesJson) as Rules;
      } catch {
        return reply.status(500).send({
          error: "Corrupt mandate rules in database",
        });
      }

      if (mandate.status !== "active") {
        reasons.push(`mandate is ${mandate.status}`);
      }

      if (new Date(parsedRules.expiresAt).getTime() <= Date.now()) {
        reasons.push("mandate expired");
      }

      const signatureValid = verifyMandate({
        rules: parsedRules,
        id: mandate.id,
        createdAt: mandate.createdAt.toISOString(),
        signature: mandate.signature,
        publicKey: mandate.publicKey,
        vaultId: mandate.vaultId,
      });

      if (!signatureValid) {
        reasons.push("mandate signature invalid");
      }

      const cartReq = JSON.parse(cart.requestJson) as {
        cart: { total: number; items: any[] };
      };
      const totalCents = Math.round(cartReq.cart.total * 100);
      const perTxCapCents = Math.round(parsedRules.perTxCap * 100);
      const monthlyCapCents = Math.round(parsedRules.monthlyCap * 100);
      const spentThisMonthCents = await getSpentThisMonthCents(mandate.id);

      if (totalCents > perTxCapCents) {
        reasons.push("cart total exceeds per-transaction cap");
      }

      if (spentThisMonthCents + totalCents > monthlyCapCents) {
        reasons.push("cart total exceeds monthly cap");
      }

      if (reasons.length > 0) {
        return reply.status(403).send({
          error: "payment not permitted",
          reasons,
        });
      }

      // 4. Create Payment row with status "created", requestId = randomUUID() BEFORE calling PayPal
      const paymentId = `pay_${randomUUID().slice(0, 8)}`;
      const requestId = randomUUID();

      const payment = await prisma.payment.create({
        data: {
          id: paymentId,
          cartId: cart.id,
          mandateId: mandate.id,
          amountCents: totalCents,
          currency: "USD",
          paypalOrderId: `pending_${requestId}`,
          status: "created",
          requestId,
        },
      });

      // 5. PayPal execution
      const isMock =
        config.PAYPAL_MODE === "mock" || paypalClient instanceof MockPayPal;

      // Vault path
      if (mandate.vaultId) {
        let order;
        try {
          order = await paypalClient.createOrder({
            items: cartReq.cart.items,
            totalCents,
            vaultId: mandate.vaultId,
            requestId,
            returnUrl: `${config.PAYPAL_RETURN_URL}?cartId=${cart.id}`,
            cancelUrl: config.PAYPAL_CANCEL_URL,
          });
        } catch (err: unknown) {
          await prisma.payment.update({
            where: { id: payment.id },
            data: { status: "failed" },
          });
          await appendReceipt(mandate.id, "payment", {
            cartId: cart.id,
            paymentId: payment.id,
            paypalOrderId: `pending_${requestId}`,
            captureId: null,
            amountCents: totalCents,
            status: "failed",
          });
          const debugId =
            err instanceof PayPalApiError ? err.debugId : undefined;
          return reply.status(502).send({
            error: "paypal error",
            debugId,
          });
        }

        await prisma.payment.update({
          where: { id: payment.id },
          data: { paypalOrderId: order.orderId },
        });

        // When order status is already COMPLETED (capture occurred during order creation), skip captureOrder
        let captureId: string;
        if (order.status === "COMPLETED" && order.captureId) {
          captureId = order.captureId;
        } else {
          try {
            const capture = await paypalClient.captureOrder(
              order.orderId,
              requestId
            );
            captureId = capture.captureId;
          } catch (err: unknown) {
            await prisma.payment.update({
              where: { id: payment.id },
              data: { status: "failed" },
            });
            await appendReceipt(mandate.id, "payment", {
              cartId: cart.id,
              paymentId: payment.id,
              paypalOrderId: order.orderId,
              captureId: null,
              amountCents: totalCents,
              status: "failed",
            });
            const debugId =
              err instanceof PayPalApiError ? err.debugId : undefined;
            return reply.status(502).send({
              error: "paypal error",
              debugId,
            });
          }
        }

        const receipt = await appendReceipt(mandate.id, "payment", {
          cartId: cart.id,
          paymentId: payment.id,
          paypalOrderId: order.orderId,
          captureId,
          amountCents: totalCents,
          status: "captured",
        });

        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "captured",
            captureId,
            receiptSeq: receipt.seq,
          },
        });

        publish({
          type: "payment",
          mandateId: mandate.id,
          cartId: cart.id,
          items: cartReq.cart.items,
          total: cartReq.cart.total,
          summary: `Payment captured: $${(totalCents / 100).toFixed(2)} (${cartReq.cart.items.length} items)`,
          at: new Date().toISOString(),
        });

        return reply.status(200).send({
          paymentId: payment.id,
          paypalOrderId: order.orderId,
          captureId,
          status: "captured",
          receiptSeq: receipt.seq,
        } satisfies PayResponse);
      }

      // Fallback path (no vaultId)
      let order;
      try {
        order = await paypalClient.createOrder({
          items: cartReq.cart.items,
          totalCents,
          requestId,
          returnUrl: `${config.PAYPAL_RETURN_URL}?cartId=${cart.id}`,
          cancelUrl: config.PAYPAL_CANCEL_URL,
        });
      } catch (err: unknown) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "failed" },
        });
        await appendReceipt(mandate.id, "payment", {
          cartId: cart.id,
          paymentId: payment.id,
          paypalOrderId: `pending_${requestId}`,
          captureId: null,
          amountCents: totalCents,
          status: "failed",
        });
        const debugId =
          err instanceof PayPalApiError ? err.debugId : undefined;
        return reply.status(502).send({
          error: "paypal error",
          debugId,
        });
      }

      await prisma.payment.update({
        where: { id: payment.id },
        data: { paypalOrderId: order.orderId },
      });

      if (isMock) {
        // Auto-capture in mock mode
        let captureId: string;
        if (order.status === "COMPLETED" && order.captureId) {
          captureId = order.captureId;
        } else {
          try {
            const capture = await paypalClient.captureOrder(
              order.orderId,
              requestId
            );
            captureId = capture.captureId;
          } catch (err: unknown) {
            await prisma.payment.update({
              where: { id: payment.id },
              data: { status: "failed" },
            });
            await appendReceipt(mandate.id, "payment", {
              cartId: cart.id,
              paymentId: payment.id,
              paypalOrderId: order.orderId,
              captureId: null,
              amountCents: totalCents,
              status: "failed",
            });
            const debugId =
              err instanceof PayPalApiError ? err.debugId : undefined;
            return reply.status(502).send({
              error: "paypal error",
              debugId,
            });
          }
        }

        const receipt = await appendReceipt(mandate.id, "payment", {
          cartId: cart.id,
          paymentId: payment.id,
          paypalOrderId: order.orderId,
          captureId,
          amountCents: totalCents,
          status: "captured",
        });

        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "captured",
            captureId,
            receiptSeq: receipt.seq,
          },
        });

        publish({
          type: "payment",
          mandateId: mandate.id,
          cartId: cart.id,
          items: cartReq.cart.items,
          total: cartReq.cart.total,
          summary: `Payment captured: $${(totalCents / 100).toFixed(2)} (${cartReq.cart.items.length} items)`,
          at: new Date().toISOString(),
        });

        return reply.status(200).send({
          paymentId: payment.id,
          paypalOrderId: order.orderId,
          captureId,
          status: "captured",
          receiptSeq: receipt.seq,
        } satisfies PayResponse);
      }

      // In sandbox mode without vaultId, return created with approveUrl
      return reply.status(200).send({
        paymentId: payment.id,
        paypalOrderId: order.orderId,
        captureId: null,
        status: "created",
        approveUrl: order.approveUrl,
      } satisfies PayResponse);
    });
  });

  // POST /payments/:id/capture
  server.post("/payments/:id/capture", async (request, reply) => {
    const { id } = request.params as { id: string };
    const payment = await prisma.payment.findUnique({
      where: { id },
    });

    if (!payment) {
      return reply.status(404).send({
        error: `Payment "${id}" not found`,
      });
    }

    if (payment.status === "captured") {
      return reply.status(200).send({
        paymentId: payment.id,
        paypalOrderId: payment.paypalOrderId,
        captureId: payment.captureId,
        status: "captured",
        receiptSeq: payment.receiptSeq ?? undefined,
      } satisfies PayResponse);
    }

    if (payment.status === "failed") {
      return reply.status(502).send({
        error: "payment failed",
      });
    }

    const cart = await prisma.cart.findUnique({
      where: { id: payment.cartId },
    });
    if (!cart) {
      return reply.status(404).send({
        error: `Cart for payment "${id}" not found`,
      });
    }
    const cartReq = JSON.parse(cart.requestJson) as {
      cart: { total: number; items: any[] };
    };

    try {
      const capture = await paypalClient.captureOrder(
        payment.paypalOrderId,
        payment.requestId || randomUUID()
      );

      const receipt = await appendReceipt(payment.mandateId, "payment", {
        cartId: payment.cartId,
        paymentId: payment.id,
        paypalOrderId: payment.paypalOrderId,
        captureId: capture.captureId,
        amountCents: payment.amountCents,
        status: "captured",
      });

      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "captured",
          captureId: capture.captureId,
          receiptSeq: receipt.seq,
        },
      });

      publish({
        type: "payment",
        mandateId: payment.mandateId,
        cartId: payment.cartId,
        items: cartReq.cart.items,
        total: cartReq.cart.total,
        summary: `Payment captured: $${(payment.amountCents / 100).toFixed(2)} (${cartReq.cart.items.length} items)`,
        at: new Date().toISOString(),
      });

      return reply.status(200).send({
        paymentId: updated.id,
        paypalOrderId: updated.paypalOrderId,
        captureId: updated.captureId,
        status: "captured",
        receiptSeq: receipt.seq,
      } satisfies PayResponse);
    } catch (err: unknown) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "failed" },
      });
      await appendReceipt(payment.mandateId, "payment", {
        cartId: payment.cartId,
        paymentId: payment.id,
        paypalOrderId: payment.paypalOrderId,
        captureId: null,
        amountCents: payment.amountCents,
        status: "failed",
      });
      const debugId =
        err instanceof PayPalApiError ? err.debugId : undefined;
      return reply.status(502).send({
        error: "paypal error",
        debugId,
      });
    }
  });
}
