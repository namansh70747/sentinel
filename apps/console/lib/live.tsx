"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

export const API_URL = process.env.NEXT_PUBLIC_DEMO_API_URL ?? "http://localhost:8790";

export type SliPoint = { at: number; availability: number; p99: number };
export type LiveStep = { at: number; incidentId: string; state: string; detail: string };
export type LiveIncident = {
  at: number;
  title: string;
  id: string;
  severity: string;
  outcome: string;
  decision: string;
};

type LiveState = {
  status: "connecting" | "live" | "offline";
  sli: SliPoint[];
  steps: LiveStep[];
  incidents: LiveIncident[];
  fire: (scenario: string) => Promise<void>;
};

const LiveContext = createContext<LiveState | null>(null);

const WINDOW = 120;

export function LiveProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const [status, setStatus] = useState<LiveState["status"]>("connecting");
  const [sli, setSli] = useState<SliPoint[]>([]);
  const [steps, setSteps] = useState<LiveStep[]>([]);
  const [incidents, setIncidents] = useState<LiveIncident[]>([]);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    setSli([]); setSteps([]); setIncidents([]); seen.current.clear();
    if (!enabled) { toast.dismiss(); return; }
    const source = new EventSource(`${API_URL}/v1/stream`);
    source.onopen = () => setStatus("live");
    source.onerror = () => setStatus("offline");
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as
        | ({ type: "sli" } & SliPoint)
        | ({ type: "step" } & LiveStep)
        | { type: "incident"; at: number; title: string; record: { id: string; severity: string; outcome: string; decision: { result: string } } };
      if (event.type === "sli") {
        setSli((prev) => [...prev, { at: event.at, availability: event.availability, p99: event.p99 }].slice(-WINDOW));
        return;
      }
      const key = `${event.type}-${event.at}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      if (event.type === "step") {
        setSteps((prev) => [{ at: event.at, incidentId: event.incidentId, state: event.state, detail: event.detail }, ...prev].slice(0, 40));
        return;
      }
      setIncidents((prev) =>
        [
          {
            at: event.at,
            title: event.title,
            id: event.record.id,
            severity: event.record.severity,
            outcome: event.record.outcome,
            decision: event.record.decision.result,
          },
          ...prev,
        ].slice(0, 12),
      );
      toast(`${event.title}`, { description: `${event.record.severity} · ${event.record.outcome} · policy ${event.record.decision.result}` });
    };
    return () => source.close();
  }, [enabled]);

  const fire = useCallback(async (scenario: string) => {
    if (!enabled) { toast.error("Open the demo workspace to replay scenarios."); return; }
    const response = await fetch(`${API_URL}/v1/replay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario }),
    }).catch(() => null);
    if (!response?.ok) {
      toast.error("API is not reachable", { description: `Start the isolated demo API with npm run dev:demo-api. ${API_URL}` });
      return;
    }
    toast.message("Signal sent", { description: `Replaying ${scenario} through the incident machine` });
  }, [enabled]);

  const value = useMemo(() => ({ status, sli, steps, incidents, fire }), [status, sli, steps, incidents, fire]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive() {
  const value = useContext(LiveContext);
  if (!value) throw new Error("useLive must be used inside LiveProvider");
  return value;
}
