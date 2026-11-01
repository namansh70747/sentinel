"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { FAILURE_CLASSES, type FailureClass, type Severity } from "@sentinel/contracts";
import { decide, NEVER_VERBS } from "@sentinel/policy";

const ARN = "arn:aws:ecs:us-east-1:111111111111:service/store/web";
const verbs = ["ecs:UpdateService", ...NEVER_VERBS];
const playbooks = ["rollback-last-deploy", "scale-within-cap", "restore-previous-secret", "shift-traffic-off-az"];
const ease = [0.22, 1, 0.36, 1] as const;

const resultTone: Record<string, string> = {
  allow: "text-sev1 border-sev1/70",
  advise: "text-amber border-amber/70",
  refuse: "text-sev2 border-sev2/70",
  escalate: "text-sev2 border-sev2/70",
};

export function PolicyLab() {
  const [mode, setMode] = useState<"advise" | "act">("advise");
  const [serviceAct, setServiceAct] = useState(true);
  const [signed, setSigned] = useState(true);
  const [severity, setSeverity] = useState<Severity>("sev1");
  const [strikes, setStrikes] = useState(0);
  const [verb, setVerb] = useState("ecs:UpdateService");
  const [playbook, setPlaybook] = useState("rollback-last-deploy");
  const [topClass, setTopClass] = useState<FailureClass>("bad-change");
  const [revision, setRevision] = useState(true);
  const [targetMatches, setTargetMatches] = useState(true);
  const [grafana, setGrafana] = useState(true);
  const [controlPlane, setControlPlane] = useState(false);

  const decision = useMemo(
    () =>
      decide({
        mode,
        serviceAct,
        signedPlaybooks: signed ? ["rollback-last-deploy"] : [],
        severity,
        strikes,
        inFlight: false,
        grafanaHealthy: grafana,
        controlPlaneKept: controlPlane,
        topClass,
        evidence: [
          {
            class: "bad-change",
            verdict: topClass === "bad-change" ? "kept" : "killed",
            summary: "deploy in window",
            evidenceId: "ev-deploy",
            fromRevision: revision ? "web:41" : undefined,
            toRevision: "web:42",
            resourceArn: targetMatches ? ARN : "arn:aws:ecs:us-east-1:111111111111:service/other/api",
          },
        ],
        requestedVerb: verb,
        requestedPlaybook: playbook,
        serviceArn: ARN,
      }),
    [mode, serviceAct, signed, severity, strikes, verb, playbook, topClass, revision, targetMatches, grafana, controlPlane],
  );

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[14px] text-muted">This is the same decision the API makes.</p>
        <h1 className="mt-1 text-[36px] font-semibold leading-none tracking-[-0.03em]">Try to make it misbehave</h1>
        <p className="mt-2 max-w-[72ch] text-[14px] text-muted">
          Flip anything. A never-list verb stays refused. An unsigned playbook stays refused. A rollback only becomes allow when every gate agrees.
        </p>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-3 border border-line bg-panel p-4 sm:grid-cols-2">
          <Seg label="Global mode" value={mode} options={["advise", "act"]} onChange={(value) => setMode(value as "advise" | "act")} />
          <Seg label="Severity (from burn)" value={severity} options={["sev1", "sev2", "sev3", "sev4"]} onChange={(value) => setSeverity(value as Severity)} />
          <Seg label="Strikes" value={String(strikes)} options={["0", "1", "2"]} onChange={(value) => setStrikes(Number(value))} />
          <Pick label="Top kept class" value={topClass} options={[...FAILURE_CLASSES]} onChange={(value) => setTopClass(value as FailureClass)} />
          <Pick label="Requested verb" value={verb} options={verbs} onChange={setVerb} />
          <Pick label="Requested playbook" value={playbook} options={playbooks} onChange={setPlaybook} />
          <Toggle label="Service act flag" on={serviceAct} onChange={setServiceAct} />
          <Toggle label="Rollback signed for service" on={signed} onChange={setSigned} />
          <Toggle label="Previous revision in evidence" on={revision} onChange={setRevision} />
          <Toggle label="Target is the catalogued ARN" on={targetMatches} onChange={setTargetMatches} />
          <Toggle label="Opening SLI readable" on={grafana} onChange={setGrafana} />
          <Toggle label="AWS control plane impaired" on={controlPlane} onChange={setControlPlane} />
        </div>

        <div className="sticky top-16 border border-line bg-panel p-4">
          <div className="font-mono text-[10px] tracking-[0.18em] text-faint">DECISION</div>
          <AnimatePresence mode="popLayout">
            <motion.div
              key={decision.result}
              initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -14, filter: "blur(4px)" }}
              transition={{ duration: 0.35, ease }}
              className={`mt-2 inline-block border px-3 py-1 font-mono text-[34px] leading-none ${resultTone[decision.result]}`}
            >
              {decision.result}
            </motion.div>
          </AnimatePresence>
          <ul className="mt-4 space-y-1.5">
            {decision.reasons.map((reason) => (
              <motion.li key={reason} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-l-2 border-amber/60 pl-2 text-[13px] text-muted">
                {reason}
              </motion.li>
            ))}
          </ul>
          <div className="mt-4 border border-line bg-[oklch(0.13_0.006_75)] px-3 py-2 font-mono text-[12px] leading-6">
            {decision.plan ? (
              <>
                <div className="text-sev1">- {decision.plan.fromRevision}</div>
                <div className="text-ok">+ {decision.plan.toRevision}</div>
                <div className="text-faint">plan {decision.plan.planHash}</div>
              </>
            ) : (
              <div className="text-faint">no plan</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Seg({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div>
      <div className="mb-1.5 text-[13px] text-muted">{label}</div>
      <div className="relative flex border border-line">
        {options.map((option) => (
          <button key={option} type="button" onClick={() => onChange(option)} className="relative flex-1 px-2 py-1.5 font-mono text-[12px]">
            {value === option ? <motion.span layoutId={`seg-${label}`} className="absolute inset-0 bg-amber/15 outline outline-1 outline-amber/60" transition={{ type: "spring", stiffness: 500, damping: 36 }} /> : null}
            <span className={`relative ${value === option ? "text-amber" : "text-muted"}`}>{option}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Pick({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[13px] text-muted">{label}</div>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full border border-line bg-[oklch(0.16_0.006_75)] px-2 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-amber">
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center justify-between border border-line px-3 py-2 text-left">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={`relative h-4 w-8 border ${on ? "border-amber bg-amber/20" : "border-line"}`}>
        <motion.span className={`absolute top-[2px] h-2.5 w-2.5 ${on ? "bg-amber" : "bg-faint"}`} animate={{ left: on ? 16 : 2 }} transition={{ type: "spring", stiffness: 600, damping: 32 }} />
      </span>
    </button>
  );
}
