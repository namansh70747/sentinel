import { describe, expect, it } from "vitest";
import { scenarios } from "@sentinel/fixtures";
import { runIncident } from "./run";

describe("incident machine", () => {
  it("walks the bad deploy to a recovered rollback when act is on", () => {
    const record = runIncident(scenarios["bad-deploy-act"]);
    expect(record.outcome).toBe("recovered");
    expect(record.decision.plan?.toRevision).toBe("web:41");
    expect(record.strikes).toBe(0);
  });

  it("writes the plan but does not execute it in advise mode", () => {
    const record = runIncident(scenarios["bad-deploy-advise"]);
    expect(record.outcome).toBe("advised");
    expect(record.events.some((event) => event.state === "execute")).toBe(false);
    expect(record.decision.plan?.planHash).toBeTruthy();
  });

  it("drops a critical-titled alarm when the SLI is healthy", () => {
    const record = runIncident(scenarios["healthy-critical-title"]);
    expect(record.outcome).toBe("closed");
    expect(record.severity).toBe("sev4");
  });

  it("refuses a scale and an IAM change", () => {
    expect(runIncident(scenarios["retry-storm"]).decision.result).toBe("refuse");
    expect(runIncident(scenarios["access-denied"]).decision.result).toBe("refuse");
  });

  it("escalates after two missed verifies and does not take a third action", () => {
    const record = runIncident(scenarios["two-strikes"]);
    expect(record.outcome).toBe("escalated");
    expect(record.strikes).toBe(2);
    expect(record.events.filter((event) => event.state === "execute")).toHaveLength(2);
  });

  it("links a duplicate and skips a maintenance window", () => {
    expect(runIncident(scenarios.duplicate).outcome).toBe("linked");
    expect(runIncident(scenarios.maintenance).outcome).toBe("skipped");
  });

  it("does not invent a revision the collector did not return", () => {
    const record = runIncident(scenarios["missing-revision"]);
    expect(record.outcome).toBe("advised");
    expect(record.decision.plan).toBeNull();
  });
});
