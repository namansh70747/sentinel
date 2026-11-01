export const FAILURE_CLASSES = [
  "saturation",
  "bad-change",
  "dependency",
  "identity",
  "quota",
  "network",
  "data",
  "control-plane",
] as const;

export type FailureClass = (typeof FAILURE_CLASSES)[number];

export type Severity = "sev1" | "sev2" | "sev3" | "sev4";

export type AuthorityMode = "advise" | "act";

export type DecisionResult = "allow" | "advise" | "refuse" | "escalate";

export type Outcome =
  | "recovered"
  | "escalated"
  | "advised"
  | "refused"
  | "skipped"
  | "linked"
  | "closed";

export interface ServiceCatalog {
  id: string;
  name: string;
  account: string;
  region: string;
  runtime: "ecs" | "eks" | "lambda" | "ec2";
  owner: string;
  availabilitySlo: number;
  latencySloMs: number;
  act: boolean;
  signedPlaybooks: string[];
  resourceArn: string;
}

export interface SliWindows {
  availabilitySlo: number;
  latencySloMs: number;
  good5m: number;
  total5m: number;
  good30m: number;
  total30m: number;
  good1h: number;
  total1h: number;
  good6h: number;
  total6h: number;
  p99_10m_ms: number;
  dataLoss: boolean;
}

export interface EvidencePacket {
  class: FailureClass;
  verdict: "kept" | "killed" | "unknown";
  summary: string;
  evidenceId: string;
  fromRevision?: string;
  toRevision?: string;
  resourceArn?: string;
}

export interface RankedHypothesis {
  class: FailureClass;
  rank: number;
  status: "kept" | "killed" | "unknown";
  because: string;
  evidenceId: string;
}

export interface Plan {
  playbookId: string;
  resourceArn: string;
  fromRevision: string;
  toRevision: string;
  planHash: string;
}

export interface Decision {
  result: DecisionResult;
  reasons: string[];
  plan: Plan | null;
}

export interface Scenario {
  id: string;
  title: string;
  service: ServiceCatalog;
  mode: AuthorityMode;
  sli: SliWindows;
  evidence: EvidencePacket[];
  requestedVerb: string;
  requestedPlaybook: string | null;
  alarmTitle: string;
  openIncidentSameSli: boolean;
  skipRule: boolean;
  grafanaHealthy: boolean;
  verify: Array<"hold" | "miss">;
}

export interface IncidentEvent {
  state: string;
  detail: string;
}

export interface IncidentRecord {
  id: string;
  serviceId: string;
  severity: Severity;
  outcome: Outcome;
  strikes: number;
  openingSli: string;
  ranked: RankedHypothesis[];
  decision: Decision;
  events: IncidentEvent[];
  narrative: string;
}
