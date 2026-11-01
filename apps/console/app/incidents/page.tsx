import Link from "next/link";
import { viewIncidents } from "../../lib/view";

export default function Incidents() {
  const incidents = viewIncidents();
  return (
    <div>
      <h1 className="text-[32px] font-bold leading-none">Incidents</h1>
      <p className="mt-2 max-w-[68ch] text-[14px] text-muted">Each row is one run of the state machine. Severity is the burn, not the alarm title.</p>
      <div className="mt-5 border border-line">
        {incidents.map((item) => (
          <Link key={item.id} href={`/incidents/${item.id}`} className="grid grid-cols-[180px_1fr_80px_100px] gap-3 border-b border-line px-3 py-3 last:border-b-0 hover:bg-panel">
            <span className="font-mono text-[12px] text-faint">{item.id}</span>
            <span>{item.title}</span>
            <span className={`font-mono text-[12px] ${item.severity === "sev1" ? "text-sev1" : "text-ok"}`}>{item.severity}</span>
            <span className="font-mono text-[12px] text-muted">{item.decision}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
