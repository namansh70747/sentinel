const changes = [
  { t: "19:48:02", kind: "deploy", detail: "task definition web:41 → web:42", watch: "burn started · rollback proposed" },
  { t: "19:21:11", kind: "config", detail: "AppConfig flag checkout_v2 unchanged", watch: "held" },
  { t: "18:02:40", kind: "infra", detail: "desired count stayed at 6", watch: "held" },
];

export default function Changes() {
  return (
    <div>
      <h1 className="text-[32px] font-bold leading-none">Changes</h1>
      <p className="mt-2 max-w-[68ch] text-[14px] text-muted">Fifteen minutes of the same SLI after every revision. A hold is a row. A burn becomes an incident.</p>
      <ol className="mt-6 border-l border-line">
        {changes.map((change) => (
          <li key={change.t} className="ml-4 border-b border-line py-3">
            <div className="font-mono text-[12px] text-amber">{change.t} · {change.kind}</div>
            <div className="mt-1">{change.detail}</div>
            <div className="text-[13px] text-muted">{change.watch}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
