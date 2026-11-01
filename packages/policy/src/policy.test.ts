import { describe, expect, it } from "vitest";
import type { DecideInput, EvidencePacket, SliWindows } from "@sentinel/contracts";
import { decide, isNeverVerb, NEVER_VERBS, severity } from "./index";

const slo = { availabilitySlo: 0.999, latencySloMs: 300 };

function healthy(): SliWindows {
  return {
    ...slo,
    good5m: 1000,
    total5m: 1000,
    good30m: 6000,
    total30m: 6000,
    good1h: 12000,
    total1h: 12000,
    good6h: 70000,
    total6h: 70000,
    p99_10m_ms: 120,
    dataLoss: false,
  };
}

function fastBurn(): SliWindows {
  return {
    ...healthy(),
    good5m: 800,
    total5m: 1000,
    good1h: 10000,
    total1h: 12000,
  };
}

const change: EvidencePacket = {
  class: "bad-change",
  verdict: "kept",
  summary: "task definition moved from app:41 to app:42",
  evidenceId: "ev-change",
  fromRevision: "app:41",
  toRevision: "app:42",
  resourceArn: "arn:aws:ecs:us-east-1:1:service/store/web",
};

function base(over: Partial<DecideInput> = {}): DecideInput {
  return {
    mode: "act",
    serviceAct: true,
    signedPlaybooks: ["rollback-last-deploy"],
    severity: "sev1",
    strikes: 0,
    inFlight: false,
    grafanaHealthy: true,
    controlPlaneKept: false,
    topClass: "bad-change",
    evidence: [change],
    requestedVerb: "ecs:UpdateService",
    requestedPlaybook: "rollback-last-deploy",
    serviceArn: change.resourceArn!,
    ...over,
  };
}

describe("severity", () => {
  it("ignores a healthy service even if someone would call it critical", () => {
    expect(severity(healthy())).toBe("sev4");
  });

  it("pages sev1 when both fast-burn windows agree", () => {
    expect(severity(fastBurn())).toBe("sev1");
  });

  it("does not page on a one-minute blip that the long window does not confirm", () => {
    const blip = { ...healthy(), good5m: 800, total5m: 1000 };
    expect(severity(blip)).toBe("sev4");
  });

  it("treats a total blackhole and data loss as sev1", () => {
    expect(severity({ ...healthy(), good5m: 0, total5m: 400 })).toBe("sev1");
    expect(severity({ ...healthy(), dataLoss: true })).toBe("sev1");
  });

  it("uses latency only when availability is inside budget", () => {
    expect(severity({ ...healthy(), p99_10m_ms: 900 })).toBe("sev3");
  });
});

describe("decide", () => {
  it("allows rollback only from the revision the collector observed", () => {
    const decision = decide(base());
    expect(decision.result).toBe("allow");
    expect(decision.plan?.fromRevision).toBe("app:42");
    expect(decision.plan?.toRevision).toBe("app:41");
  });

  it("downgrades to advise when the global mode is advise", () => {
    expect(decide(base({ mode: "advise" })).result).toBe("advise");
  });

  it("refuses every never-list verb even if a playbook was signed", () => {
    for (const verb of NEVER_VERBS) {
      expect(isNeverVerb(verb)).toBe(true);
      expect(decide(base({ requestedVerb: verb })).result).toBe("refuse");
    }
  });

  it("refuses a playbook the registry does not execute", () => {
    expect(decide(base({ requestedPlaybook: "scale-within-cap" })).result).toBe("refuse");
  });

  it("escalates at two strikes and when the control plane is the cause", () => {
    expect(decide(base({ strikes: 2 })).result).toBe("escalate");
    expect(decide(base({ controlPlaneKept: true })).result).toBe("escalate");
    expect(decide(base({ grafanaHealthy: false })).result).toBe("escalate");
  });

  it("advises when the previous revision was not in evidence", () => {
    const packet = { ...change, fromRevision: undefined };
    expect(decide(base({ evidence: [packet] })).result).toBe("advise");
  });

  it("refuses a target that is not the catalogued service", () => {
    const packet = { ...change, resourceArn: "arn:aws:ecs:us-east-1:1:service/other/web" };
    expect(decide(base({ evidence: [packet] })).result).toBe("refuse");
  });

  it("binds the plan hash to the exact revisions", () => {
    const first = decide(base()).plan?.planHash;
    expect(first).toMatch(/^[0-9a-f]{16}$/);
    expect(decide(base()).plan?.planHash).toBe(first);
    const moved = { ...change, toRevision: "app:43" };
    expect(decide(base({ evidence: [moved] })).plan?.planHash).not.toBe(first);
  });

  it("does not roll back a latency-only incident by itself", () => {
    expect(decide(base({ severity: "sev3" })).result).toBe("advise");
  });
});
