import { viewIncidents } from "../../lib/view";

export default function Audit() {
  const rows = viewIncidents().flatMap((incident) =>
    incident.events
      .filter((event) => ["decide", "execute", "escalate", "verify"].includes(event.state))
      .map((event) => ({ id: incident.id, ...event })),
  );
  return (
    <div>
      <h1 className="text-[32px] font-bold leading-none">Record</h1>
      <div className="mt-5 border border-line font-mono text-[12px]">
        {rows.map((row, index) => (
          <div key={`${row.id}-${index}`} className="grid grid-cols-[200px_90px_1fr] gap-3 border-b border-line px-3 py-2 last:border-b-0">
            <span className="text-faint">{row.id}</span>
            <span className="text-amber">{row.state}</span>
            <span className="text-muted">{row.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
