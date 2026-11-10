import { describe, it, expect, afterAll } from "vitest";
import { buildServer } from "../src/server.js";

describe("Health check", () => {
  it("GET /health returns { ok: true } with status 200", async () => {
    const server = await buildServer();
    const response = await server.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    await server.close();
  });
});
