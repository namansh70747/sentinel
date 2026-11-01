import type { IncidentRecord, Scenario, SliWindows } from "@sentinel/contracts";
import { decide, severity } from "@sentinel/policy";
import { rank } from "./rank";

function opening(sample: SliWindows): string {
  const ratio = sample.total5m === 0 ? 1 : sample.good5m / sample.total5m;
  return `availability ${(ratio * 100).toFixed(2)}% / p99 ${sample.p99_10m_ms}ms`;
}

export function runIncident(scenario: Scenario): IncidentRecord {
  const events: IncidentRecord["events"] = [
    { state: "signal", detail: scenario.alarmTitle || "SLI poll" },
  ];
  const sev = severity(scenario.sli);

  if (scenario.skipRule) {
    events.push({ state: "triage", detail: "matched a signed skip rule" });
    return blank(scenario, sev, "skipped", 0, events, "Skipped by a signed rule.");
  }
  if (scenario.openIncidentSameSli) {
    events.push({ state: "triage", detail: "linked to the open incident for this SLI" });
    return blank(scenario, sev, "linked", 0, events, "Linked to the incident already open.");
  }
  if (sev === "sev4") {
    events.push({ state: "severity", detail: "no user-facing breach" });
    return blank(scenario, sev, "closed", 0, events, "Alarm stored. SLI is inside the SLO, so no incident was opened.");
  }

  events.push({ state: "severity", detail: sev });
  const ranked = rank(scenario.evidence);
  const top = ranked.find((item) => item.status === "kept") ?? null;
  events.push({
    state: "rank",
    detail: top ? `${top.class} kept: ${top.because}` : "no class kept",
  });

  let strikes = 0;
  let decision = decide({
    mode: scenario.mode,
    serviceAct: scenario.service.act,
    signedPlaybooks: scenario.service.signedPlaybooks,
    severity: sev,
    strikes,
    inFlight: false,
    grafanaHealthy: scenario.grafanaHealthy,
    controlPlaneKept: scenario.evidence.some(
      (packet) => packet.class === "control-plane" && packet.verdict === "kept",
    ),
    topClass: top?.class ?? null,
    evidence: scenario.evidence,
    requestedVerb: scenario.requestedVerb,
    requestedPlaybook: scenario.requestedPlaybook,
    serviceArn: scenario.service.resourceArn,
  });
  events.push({ state: "decide", detail: `${decision.result}: ${decision.reasons.join("; ")}` });

  if (decision.result === "allow") {
    for (const step of scenario.verify) {
      events.push({
        state: "execute",
        detail: `rollback ${decision.plan?.fromRevision} -> ${decision.plan?.toRevision}`,
      });
      if (step === "hold") {
        events.push({ state: "verify", detail: "opening SLI held for 5 minutes" });
        return finish(scenario, sev, "recovered", strikes, ranked, decision, events);
      }
      strikes += 1;
      events.push({ state: "verify", detail: `SLI did not hold (strike ${strikes})` });
      if (strikes >= 2) {
        decision = { ...decision, result: "escalate", reasons: ["two mitigations did not move the SLI"] };
        events.push({ state: "escalate", detail: "owner has command" });
        return finish(scenario, sev, "escalated", strikes, ranked, decision, events);
      }
    }
  }

  const outcome =
    decision.result === "escalate" ? "escalated" : decision.result === "refuse" ? "refused" : "advised";
  if (outcome === "escalated") events.push({ state: "escalate", detail: "owner has command" });
  return finish(scenario, sev, outcome, strikes, ranked, decision, events);
}

function blank(
  scenario: Scenario,
  sev: IncidentRecord["severity"],
  outcome: IncidentRecord["outcome"],
  strikes: number,
  events: IncidentRecord["events"],
  narrative: string,
): IncidentRecord {
  return finish(
    scenario,
    sev,
    outcome,
    strikes,
    [],
    { result: "refuse", reasons: [narrative], plan: null },
    events,
    narrative,
  );
}

function finish(
  scenario: Scenario,
  sev: IncidentRecord["severity"],
  outcome: IncidentRecord["outcome"],
  strikes: number,
  ranked: IncidentRecord["ranked"],
  decision: IncidentRecord["decision"],
  events: IncidentRecord["events"],
  narrative?: string,
): IncidentRecord {
  const kept = ranked.find((item) => item.status === "kept");
  return {
    id: `inc-${scenario.id}`,
    serviceId: scenario.service.id,
    severity: sev,
    outcome,
    strikes,
    openingSli: opening(scenario.sli),
    ranked,
    decision,
    events,
    narrative:
      narrative ??
      (kept
        ? `${scenario.service.name} is ${sev}. ${kept.because} Policy ${decision.result}.`
        : `${scenario.service.name} is ${sev}. No class was kept.`),
  };
}
