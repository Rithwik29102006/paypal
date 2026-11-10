import type { FastifyInstance } from "fastify";
import { LiveEventV2 } from "@mandate/shared";
import { config } from "../config.js";
import { subscribe } from "../events.js";

export async function eventRoutes(server: FastifyInstance) {
  server.get("/events", (request, reply) => {
    reply.hijack();
    const raw = reply.raw;

    raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": config.WEB_ORIGIN,
      "Access-Control-Allow-Credentials": "true",
    });

    raw.write(": connected\n\n");

    const listener = (event: LiveEventV2) => {
      try {
        const validated = LiveEventV2.parse(event);
        raw.write(`data: ${JSON.stringify(validated)}\n\n`);
      } catch (err) {
        console.error("Invalid event emitted to SSE:", err);
      }
    };

    const unsubscribe = subscribe(listener);

    const heartbeatTimer = setInterval(() => {
      try {
        raw.write(": heartbeat\n\n");
      } catch {
        // Socket closed
      }
    }, 15000);

    request.raw.on("close", () => {
      clearInterval(heartbeatTimer);
      unsubscribe();
    });
  });
}
