import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { CONNECTORS, missingEnv } from "@sentinel/connectors";
import type { IncidentRecord } from "@sentinel/contracts";
import { runIncident } from "@sentinel/engine";
import { scenarioList, scenarios, storefront } from "@sentinel/fixtures";

const port = Number(process.env.SENTINEL_PORT ?? 8787);
const mode = process.env.SENTINEL_MODE ?? "advise";

type StreamEvent =
  | { type: "sli"; at: number; availability: number; p99: number }
  | { type: "step"; at: number; incidentId: string; state: string; detail: string }
  | { type: "incident"; at: number; record: IncidentRecord; title: string };

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

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
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

setInterval(() => {
  tick += 1;
  const drop = burning > 0 ? 19.6 * Math.sin((Math.PI * (40 - burning)) / 40) : 0;
  if (burning > 0) burning -= 1;
  const availability = 99.93 + Math.sin(tick / 7) * 0.03 - drop + (Math.random() - 0.5) * 0.02;
  const p99 = 132 + Math.sin(tick / 5) * 9 + (burning > 0 ? 60 : 0) + Math.random() * 6;
  broadcast({ type: "sli", at: Date.now(), availability: Number(availability.toFixed(3)), p99: Math.round(p99) });
}, 1000);

function replay(id: keyof typeof scenarios) {
  const scenario = scenarios[id];
  const record = runIncident(scenario);
  burning = record.severity === "sev1" ? 40 : 0;
  record.events.forEach((event, index) => {
    setTimeout(() => {
      broadcast({ type: "step", at: Date.now(), incidentId: record.id, state: event.state, detail: event.detail });
      if (index === record.events.length - 1) {
        broadcast({ type: "incident", at: Date.now(), record, title: scenario.title });
        if (record.outcome === "recovered") burning = 0;
      }
    }, 1400 * (index + 1));
  });
  return record;
}

const server = createServer(async (req, res) => {
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
    send(res, 200, { ok: true, mode, clients: clients.size });
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
    send(res, 200, [storefront]);
    return;
  }
  if (req.method === "GET" && url.pathname === "/v1/incidents") {
    send(res, 200, records);
    return;
  }
  if (req.method === "GET" && url.pathname.startsWith("/v1/incidents/")) {
    const id = url.pathname.split("/").pop();
    const found = records.find((item) => item.record.id === id || item.scenario === id);
    send(res, found ? 200 : 404, found ?? { error: "not found" });
    return;
  }
  if (req.method === "GET" && url.pathname === "/v1/connectors") {
    send(res, 200, CONNECTORS.map((item) => ({ ...item, missing: missingEnv(item) })));
    return;
  }
  const isWebhook = url.pathname === "/v1/signals/grafana";
  if (req.method === "POST" && (isWebhook || url.pathname === "/v1/replay")) {
    const secret = process.env.SENTINEL_WEBHOOK_SECRET;
    if (isWebhook && !secret) {
      send(res, 503, { error: "set SENTINEL_WEBHOOK_SECRET before accepting webhooks" });
      return;
    }
    if (isWebhook && req.headers["x-sentinel-secret"] !== secret) {
      send(res, 401, { error: "bad webhook secret" });
      return;
    }
    const raw = await readBody(req);
    let id: keyof typeof scenarios = "bad-deploy-advise";
    try {
      const body = JSON.parse(raw || "{}") as { scenario?: string };
      if (body.scenario && body.scenario in scenarios) id = body.scenario as keyof typeof scenarios;
    } catch {
      send(res, 400, { error: "body must be json" });
      return;
    }
    send(res, 202, replay(id));
    return;
  }
  send(res, 404, { error: "not found" });
});

server.listen(port, () => {
  console.log(`sentinel api on http://localhost:${port} mode=${mode}`);
});
