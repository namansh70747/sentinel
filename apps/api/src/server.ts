import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { CONNECTORS, missingEnv } from "@sentinel/connectors";
import type { IncidentRecord } from "@sentinel/contracts";
import { runIncident } from "@sentinel/engine";
import { scenarioList, scenarios, storefront } from "@sentinel/fixtures";

export function createSentinelServer(config: { demo?: boolean; mode?: string } = {}) {
const mode = config.mode ?? process.env.SENTINEL_MODE ?? "advise";
const demo = config.demo ?? process.env.SENTINEL_DEMO === "true";

type StreamEvent =
  | { type: "sli"; at: number; availability: number; p99: number }
  | { type: "step"; at: number; incidentId: string; state: string; detail: string }
  | { type: "incident"; at: number; record: IncidentRecord; title: string };

const timers = new Set<ReturnType<typeof setTimeout>>();
const clients = new Set<ServerResponse>();
const history: StreamEvent[] = [];

function broadcast(event: StreamEvent) {
  history.push(event);
  if (history.length > 400) history.shift();
  const frame = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) client.write(frame);
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(body));
}

class BodyTooLarge extends Error {}
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 65536) { reject(new BodyTooLarge("Body exceeds 64 KiB")); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const records = scenarioList.map((scenario) => ({
  scenario: scenario.id,
  title: scenario.title,
  record: runIncident(scenario),
}));

let tick = 0;
let burning = 0;

const ticker = demo ? setInterval(() => {
  tick += 1;
  const drop = burning > 0 ? 19.6 * Math.sin((Math.PI * (40 - burning)) / 40) : 0;
  if (burning > 0) burning -= 1;
  const availability = 99.93 + Math.sin(tick / 7) * 0.03 - drop + (Math.random() - 0.5) * 0.02;
  const p99 = 132 + Math.sin(tick / 5) * 9 + (burning > 0 ? 60 : 0) + Math.random() * 6;
  broadcast({ type: "sli", at: Date.now(), availability: Number(availability.toFixed(3)), p99: Math.round(p99) });
}, 1000) : undefined;

function replay(id: keyof typeof scenarios) {
  const scenario = scenarios[id];
  const record = runIncident(scenario);
  burning = record.severity === "sev1" ? 40 : 0;
  record.events.forEach((event, index) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      broadcast({ type: "step", at: Date.now(), incidentId: record.id, state: event.state, detail: event.detail });
      if (index === record.events.length - 1) {
        broadcast({ type: "incident", at: Date.now(), record, title: scenario.title });
        if (record.outcome === "recovered") burning = 0;
      }
    }, 1400 * (index + 1));
    timers.add(timer);
  });
  return record;
}

const server = createServer((req, res) => {
  void handle(req, res).catch(error => {
    if (!res.headersSent) send(res, error instanceof BodyTooLarge ? 413 : 500, { error: error instanceof BodyTooLarge ? error.message : "Request failed" });
    else res.end();
  });
});
async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, x-sentinel-secret",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    });
    res.end();
    return;
  }
  if (req.method === "GET" && url.pathname === "/healthz") {
    send(res, 200, { ok: true, mode, demo, clients: clients.size });
    return;
  }
  if (req.method === "GET" && url.pathname === "/v1/stream") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "access-control-allow-origin": "*",
    });
    res.write(`retry: 2000\n\n`);
    for (const event of history.slice(-60)) res.write(`data: ${JSON.stringify(event)}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }
  if (req.method === "GET" && url.pathname === "/v1/services") {
    send(res, 200, demo ? [storefront] : []);
    return;
  }
  if (req.method === "GET" && url.pathname === "/v1/incidents") {
    send(res, 200, demo ? records : []);
    return;
  }
  if (req.method === "GET" && url.pathname.startsWith("/v1/incidents/")) {
    const id = url.pathname.split("/").pop();
    const found = demo && records.find((item) => item.record.id === id || item.scenario === id);
    send(res, found ? 200 : 404, found || { error: "not found" });
    return;
  }
  if (req.method === "GET" && url.pathname === "/v1/connectors") {
    send(res, 200, CONNECTORS.map((item) => ({ ...item, missing: missingEnv(item) })));
    return;
  }
  const isWebhook = url.pathname === "/v1/signals/grafana";
  if (req.method === "POST" && isWebhook) {
    send(res, 501, { error: "Grafana ingestion is not implemented; no incident was created" });
    return;
  }
  if (req.method === "POST" && url.pathname === "/v1/replay" && !demo) {
    send(res, 403, { error: "Replay requires SENTINEL_DEMO=true" });
    return;
  }
  if (req.method === "POST" && (isWebhook || url.pathname === "/v1/replay")) {
    const raw = await readBody(req);
    let id: keyof typeof scenarios;
    try {
      const body = JSON.parse(raw || "{}") as { scenario?: string };
      if (!body || typeof body.scenario !== "string" || !Object.hasOwn(scenarios, body.scenario)) {
        send(res, 400, { error: "scenario must name a known demo scenario" });
        return;
      }
      id = body.scenario as keyof typeof scenarios;
    } catch {
      send(res, 400, { error: "body must be json" });
      return;
    }
    send(res, 202, replay(id));
    return;
  }
  send(res, 404, { error: "not found" });
}

server.on("close", () => {
  if (ticker) clearInterval(ticker);
  for (const timer of timers) clearTimeout(timer);
});
return server;
}
