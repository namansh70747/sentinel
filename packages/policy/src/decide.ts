import type {
  AuthorityMode,
  Decision,
  EvidencePacket,
  FailureClass,
  Severity,
} from "@sentinel/contracts";
import { isNeverVerb } from "./never";

export const ROLLBACK_PLAYBOOK = "rollback-last-deploy";

export interface DecideInput {
  mode: AuthorityMode;
  serviceAct: boolean;
  signedPlaybooks: string[];
  severity: Severity;
  strikes: number;
  inFlight: boolean;
  grafanaHealthy: boolean;
  controlPlaneKept: boolean;
  topClass: FailureClass | null;
  evidence: EvidencePacket[];
  requestedVerb: string;
  requestedPlaybook: string | null;
  serviceArn: string;
}

export function planHash(parts: {
  playbookId: string;
  resourceArn: string;
  fromRevision: string;
  toRevision: string;
}): string {
  const input = [parts.playbookId, parts.resourceArn, parts.fromRevision, parts.toRevision].join("|");
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

export function decide(input: DecideInput): Decision {
  const reasons: string[] = [];
  const change = input.evidence.find((packet) => packet.class === "bad-change" && packet.verdict === "kept");

  if (isNeverVerb(input.requestedVerb)) {
    return { result: "refuse", reasons: [`never-list verb ${input.requestedVerb}`], plan: null };
  }
  if (input.requestedPlaybook && input.requestedPlaybook !== ROLLBACK_PLAYBOOK) {
    return {
      result: "refuse",
      reasons: [`playbook ${input.requestedPlaybook} is not signed for execution`],
      plan: null,
    };
  }
  if (input.strikes >= 2) {
    return { result: "escalate", reasons: ["two mitigations did not move the SLI"], plan: null };
  }
  if (input.severity === "sev4") {
    return { result: "refuse", reasons: ["no user SLI breach"], plan: null };
  }
  if (input.inFlight) {
    return { result: "refuse", reasons: ["an action is already in flight"], plan: null };
  }
  if (!input.grafanaHealthy) {
    return { result: "escalate", reasons: ["opening SLI could not be read"], plan: null };
  }
  if (input.controlPlaneKept) {
    return { result: "escalate", reasons: ["cloud control plane is impaired"], plan: null };
  }
  if (input.topClass !== "bad-change") {
    return {
      result: "advise",
      reasons: [`top class is ${input.topClass ?? "unknown"}; v1 executes only rollback`],
      plan: null,
    };
  }
  if (!change?.fromRevision || !change.toRevision || !change.resourceArn) {
    return { result: "advise", reasons: ["bad change is kept but the previous revision is unknown"], plan: null };
  }
  if (change.resourceArn !== input.serviceArn) {
    return { result: "refuse", reasons: ["revision target is not the catalogued resource"], plan: null };
  }
  if (change.fromRevision === change.toRevision) {
    return { result: "refuse", reasons: ["from and to revisions are the same"], plan: null };
  }

  const plan = {
    playbookId: ROLLBACK_PLAYBOOK,
    resourceArn: change.resourceArn,
    fromRevision: change.toRevision,
    toRevision: change.fromRevision,
    planHash: planHash({
      playbookId: ROLLBACK_PLAYBOOK,
      resourceArn: change.resourceArn,
      fromRevision: change.toRevision,
      toRevision: change.fromRevision,
    }),
  };

  if (input.severity === "sev3") {
    reasons.push("latency-only breach is advice until a human approves");
    return { result: "advise", reasons, plan };
  }
  if (!input.signedPlaybooks.includes(ROLLBACK_PLAYBOOK)) {
    reasons.push("rollback playbook is not signed for this service");
    return { result: "advise", reasons, plan };
  }
  if (!input.serviceAct || input.mode !== "act") {
    reasons.push(input.mode !== "act" ? "global mode is advise" : "service act flag is off");
    return { result: "advise", reasons, plan };
  }

  reasons.push("signed rollback of the revision observed in evidence");
  return { result: "allow", reasons, plan };
}
