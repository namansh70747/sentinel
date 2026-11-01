import {
  FAILURE_CLASSES,
  type EvidencePacket,
  type FailureClass,
  type RankedHypothesis,
} from "@sentinel/contracts";

const ORDER: FailureClass[] = [
  "bad-change",
  "saturation",
  "dependency",
  "network",
  "identity",
  "quota",
  "data",
  "control-plane",
];

export function rank(evidence: EvidencePacket[]): RankedHypothesis[] {
  const byClass = new Map(evidence.map((packet) => [packet.class, packet]));
  const kept = ORDER.filter((name) => byClass.get(name)?.verdict === "kept");
  const rest = FAILURE_CLASSES.filter((name) => !kept.includes(name));
  return [...kept, ...rest].map((name, index) => {
    const packet = byClass.get(name);
    return {
      class: name,
      rank: index + 1,
      status: packet?.verdict ?? "unknown",
      because: packet?.summary ?? "no evidence collected",
      evidenceId: packet?.evidenceId ?? `gap-${name}`,
    };
  });
}
