import type { EvidencePacket, Scenario, ServiceCatalog, SliWindows } from "@sentinel/contracts";

export const storefront: ServiceCatalog = {
  id: "storefront-web",
  name: "storefront-web",
  account: "110144245794",
  region: "ap-southeast-2",
  runtime: "ecs",
  owner: "harshit",
  availabilitySlo: 0.999,
  latencySloMs: 300,
  act: true,
  signedPlaybooks: ["rollback-last-deploy"],
  resourceArn: "arn:aws:ecs:ap-southeast-2:110144245794:service/sentinel-cluster/storefront-service",
};

const baseSli: SliWindows = {
  availabilitySlo: 0.999,
  latencySloMs: 300,
  good5m: 1000,
  total5m: 1000,
  good30m: 6000,
  total30m: 6000,
  good1h: 12000,
  total1h: 12000,
  good6h: 70000,
  total6h: 70000,
  p99_10m_ms: 140,
  dataLoss: false,
};

const burned: SliWindows = {
  ...baseSli,
  good5m: 800,
  total5m: 1000,
  good1h: 10000,
  total1h: 12000,
};

const deploy: EvidencePacket = {
  class: "bad-change",
  verdict: "kept",
  summary: "ECS deployment moved task definition web:41 to web:42 six minutes before the burn.",
  evidenceId: "ev-deploy",
  fromRevision: "web:41",
  toRevision: "web:42",
  resourceArn: storefront.resourceArn,
};

function killed(partial: Pick<EvidencePacket, "class" | "summary" | "evidenceId">): EvidencePacket {
  return { ...partial, verdict: "killed" };
}

function scenario(partial: Omit<Scenario, "service"> & { service?: ServiceCatalog }): Scenario {
  return { service: storefront, ...partial };
}

export const scenarios = {
  "bad-deploy-act": scenario({
    id: "bad-deploy-act",
    title: "Bad deploy, act mode",
    mode: "act",
    sli: burned,
    evidence: [
      deploy,
      killed({ class: "saturation", summary: "CPU 40%. Latency did not lead errors.", evidenceId: "ev-sat" }),
      killed({ class: "dependency", summary: "No failing downstream span.", evidenceId: "ev-dep" }),
    ],
    requestedVerb: "ecs:UpdateService",
    requestedPlaybook: "rollback-last-deploy",
    alarmTitle: "storefront availability burn",
    openIncidentSameSli: false,
    skipRule: false,
    grafanaHealthy: true,
    verify: ["hold"],
  }),
  "bad-deploy-advise": scenario({
    id: "bad-deploy-advise",
    title: "Bad deploy, advise mode",
    mode: "advise",
    sli: burned,
    evidence: [deploy],
    requestedVerb: "ecs:UpdateService",
    requestedPlaybook: "rollback-last-deploy",
    alarmTitle: "storefront availability burn",
    openIncidentSameSli: false,
    skipRule: false,
    grafanaHealthy: true,
    verify: ["hold"],
  }),
  "healthy-critical-title": scenario({
    id: "healthy-critical-title",
    title: "Alarm titled CRITICAL, SLI healthy",
    mode: "act",
    sli: baseSli,
    evidence: [],
    requestedVerb: "ecs:UpdateService",
    requestedPlaybook: "rollback-last-deploy",
    alarmTitle: "CRITICAL cpu",
    openIncidentSameSli: false,
    skipRule: false,
    grafanaHealthy: true,
    verify: ["hold"],
  }),
  "retry-storm": scenario({
    id: "retry-storm",
    title: "Retry storm that looks like saturation",
    mode: "act",
    sli: burned,
    evidence: [
      {
        class: "saturation",
        verdict: "kept",
        summary: "Latency rose after retries, not before. Scaling would hide the storm.",
        evidenceId: "ev-retry",
      },
    ],
    requestedVerb: "ecs:UpdateService",
    requestedPlaybook: "scale-within-cap",
    alarmTitle: "storefront latency",
    openIncidentSameSli: false,
    skipRule: false,
    grafanaHealthy: true,
    verify: ["hold"],
  }),
  "access-denied": scenario({
    id: "access-denied",
    title: "AccessDenied after a rotation",
    mode: "act",
    sli: burned,
    evidence: [
      {
        class: "identity",
        verdict: "kept",
        summary: "AccessDenied on the task role tripled in the window.",
        evidenceId: "ev-iam",
      },
    ],
    requestedVerb: "iam:AttachRolePolicy",
    requestedPlaybook: null,
    alarmTitle: "storefront 5xx",
    openIncidentSameSli: false,
    skipRule: false,
    grafanaHealthy: true,
    verify: ["hold"],
  }),
  "two-strikes": scenario({
    id: "two-strikes",
    title: "Rollback twice, SLI never holds",
    mode: "act",
    sli: burned,
    evidence: [deploy],
    requestedVerb: "ecs:UpdateService",
    requestedPlaybook: "rollback-last-deploy",
    alarmTitle: "storefront availability burn",
    openIncidentSameSli: false,
    skipRule: false,
    grafanaHealthy: true,
    verify: ["miss", "miss"],
  }),
  duplicate: scenario({
    id: "duplicate",
    title: "Duplicate page",
    mode: "advise",
    sli: burned,
    evidence: [deploy],
    requestedVerb: "ecs:UpdateService",
    requestedPlaybook: "rollback-last-deploy",
    alarmTitle: "storefront availability burn",
    openIncidentSameSli: true,
    skipRule: false,
    grafanaHealthy: true,
    verify: ["hold"],
  }),
  maintenance: scenario({
    id: "maintenance",
    title: "Maintenance window",
    mode: "advise",
    sli: burned,
    evidence: [],
    requestedVerb: "ecs:UpdateService",
    requestedPlaybook: null,
    alarmTitle: "storefront availability burn",
    openIncidentSameSli: false,
    skipRule: true,
    grafanaHealthy: true,
    verify: ["hold"],
  }),
  "missing-revision": scenario({
    id: "missing-revision",
    title: "Bad change with no previous revision",
    mode: "act",
    sli: burned,
    evidence: [
      {
        class: "bad-change",
        verdict: "kept",
        summary: "A deploy landed, but the previous task definition is not ACTIVE.",
        evidenceId: "ev-gap",
        resourceArn: storefront.resourceArn,
      },
    ],
    requestedVerb: "ecs:UpdateService",
    requestedPlaybook: "rollback-last-deploy",
    alarmTitle: "storefront availability burn",
    openIncidentSameSli: false,
    skipRule: false,
    grafanaHealthy: true,
    verify: ["hold"],
  }),
} satisfies Record<string, Scenario>;

export const scenarioList = Object.values(scenarios);
