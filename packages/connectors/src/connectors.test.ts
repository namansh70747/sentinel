import { describe, expect, it } from "vitest";
import { CONNECTORS, connectorById, missingEnv } from "./index";

describe("connector catalog", () => {
  it("registers the tools the plan names, once each", () => {
    const ids = CONNECTORS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["grafana", "datadog", "pagerduty", "slack", "argocd", "holmesgpt", "k8sgpt", "steampipe", "prowler", "ecs", "eks"]) {
      expect(connectorById(id)).toBeTruthy();
    }
    expect(CONNECTORS.length).toBeGreaterThan(90);
  });

  it("reports the env vars a live connector still needs", () => {
    expect(missingEnv(connectorById("grafana")!, {})).toEqual(["GRAFANA_URL", "GRAFANA_TOKEN"]);
  });

  it("keeps chaos tools marked as writers so production policy can refuse them", () => {
    expect(connectorById("chaos-mesh")?.writes).toBe(true);
    expect(connectorById("fis")?.writes).toBe(true);
  });
});
