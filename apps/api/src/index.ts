import { config } from "./config.js";
import { buildServer } from "./server.js";

async function main() {
  const server = await buildServer();
  try {
    await server.listen({ port: config.PORT, host: "0.0.0.0" });
    console.log(`Mandate API listening on port ${config.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
