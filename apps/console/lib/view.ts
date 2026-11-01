import type { IncidentRecord } from "@sentinel/contracts";
import { records, service, connectors } from "./records";

export type ViewEvent = { state: string; detail: string };
export type ViewRank = {
  class: string;
  rank: number;
  status: string;
  because: string;
  evidenceId: string;
};
export type ViewPlan = { from: string; to: string; hash: string; arn: string } | null;

export type ViewIncident = {
  id: string;
  scenarioId: string;
  title: string;
  severity: IncidentRecord["severity"];
  outcome: IncidentRecord["outcome"];
  strikes: number;
  opening: string;
  narrative: string;
  decision: IncidentRecord["decision"]["result"];
  reasons: string[];
  events: ViewEvent[];
  ranked: ViewRank[];
  plan: ViewPlan;
  alarm: string;
};

export function viewIncidents(): ViewIncident[] {
  return records.map(({ scenario, record }) => ({
    id: record.id,
    scenarioId: scenario.id,
    title: scenario.title,
    severity: record.severity,
    outcome: record.outcome,
    strikes: record.strikes,
    opening: record.openingSli,
    narrative: record.narrative,
    decision: record.decision.result,
    reasons: record.decision.reasons,
    events: record.events,
    ranked: record.ranked.filter((item) => item.status !== "unknown"),
    plan: record.decision.plan
      ? {
          from: record.decision.plan.fromRevision,
          to: record.decision.plan.toRevision,
          hash: record.decision.plan.planHash,
          arn: record.decision.plan.resourceArn,
        }
      : null,
    alarm: scenario.alarmTitle,
  }));
}

export function viewService() {
  return service;
}

export function viewConnectors() {
  return connectors.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    capabilities: item.capabilities,
    authEnv: item.authEnv,
    writes: item.writes,
    ready: item.authEnv.every((key) => Boolean(process.env[key])),
  }));
}
