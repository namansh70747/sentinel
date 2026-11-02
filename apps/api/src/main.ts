import { createSentinelServer } from "./server";
const port = Number(process.env.SENTINEL_PORT ?? 8787);
const server = createSentinelServer();
server.listen(port, () => console.log(`Sentinel API listening on port ${port}`));
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => {
  server.close();
  server.closeAllConnections();
});
