import fastify, { type FastifyInstance, type FastifyError } from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { mandateRoutes } from "./routes/mandates.js";
import { receiptRoutes } from "./routes/receipts.js";
import { checkRoutes } from "./routes/check.js";
import { approvalRoutes } from "./routes/approvals.js";
import { eventRoutes } from "./routes/events.js";
import { payRoutes } from "./routes/pay.js";
import { callDetector, type DetectorClient } from "./detector.js";
import { getPayPalClient, type PayPalClient } from "./paypal/client.js";

export interface ServerOptions {
  detector?: DetectorClient;
  paypalClient?: PayPalClient;
}

export async function buildServer(
  options: ServerOptions = {}
): Promise<FastifyInstance> {
  const server = fastify({
    logger: process.env.NODE_ENV === "test" ? false : true,
  });

  // CORS configured for WEB_ORIGIN
  await server.register(cors, {
    origin: [config.WEB_ORIGIN],
    credentials: true,
  });

  // Global error handler returning { error }
  server.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error(error);
    const statusCode =
      typeof error.statusCode === "number" &&
      error.statusCode >= 400 &&
      error.statusCode < 600
        ? error.statusCode
        : 500;
    return reply.status(statusCode).send({
      error: error.message || "Internal server error",
    });
  });

  // GET /health -> { ok: true }
  server.get("/health", async () => {
    return { ok: true };
  });

  // Domain routes
  const ppClient = options.paypalClient ?? getPayPalClient();
  await mandateRoutes(server, ppClient);
  await payRoutes(server, ppClient);
  await server.register(receiptRoutes);
  await server.register(eventRoutes);
  await server.register(approvalRoutes);
  await checkRoutes(server, options.detector ?? callDetector);

  return server;
}
