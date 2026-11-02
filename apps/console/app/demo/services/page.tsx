import { viewService } from "../../../lib/view";

export default function Services() {
  const service = viewService();
  return (
    <div>
      <h1 className="text-[32px] font-bold leading-none">{service.name}</h1>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Spec k="account" v={service.account} />
        <Spec k="region" v={service.region} />
        <Spec k="runtime" v={service.runtime} />
        <Spec k="owner" v={service.owner} />
        <Spec k="availability SLO" v={String(service.availabilitySlo)} />
        <Spec k="latency SLO" v={`${service.latencySloMs} ms`} />
        <Spec k="act flag" v={service.act ? "true, still gated by advise" : "false"} />
        <Spec k="signed" v={service.signedPlaybooks.join(", ")} />
      </div>
      <div className="mt-3 border border-line bg-panel px-3 py-3 font-mono text-[12px] text-muted">{service.resourceArn}</div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between font-mono text-[11px] text-faint">
          <span>30 day error budget remaining</span>
          <span>62%</span>
        </div>
        <div className="h-2 bg-panel-2">
          <div className="h-2 bg-amber" style={{ width: "62%" }} />
        </div>
      </div>
    </div>
  );
}

function Spec({ k, v }: { k: string; v: string }) {
  return (
    <div className="border border-line bg-panel px-3 py-3">
      <div className="font-mono text-[10px] tracking-[0.14em] text-faint">{k}</div>
      <div className="mt-1 text-[15px]">{v}</div>
    </div>
  );
}
