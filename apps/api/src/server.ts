import fastify, { type FastifyInstance, type FastifyError } from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { mandateRoutes } from "./routes/mandates.js";
import { receiptRoutes } from "./routes/receipts.js";

export async function buildServer(): Promise<FastifyInstance> {
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
  await server.register(mandateRoutes);
  await server.register(receiptRoutes);

  return server;
}
