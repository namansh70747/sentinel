"use client";

import Link from "next/link";
import type { ViewIncident } from "../lib/view";
import { useLive } from "../lib/live";
import { LiveChart } from "./live-chart";

export function FleetBoard({ incidents }: { incidents: ViewIncident[] }) {
  const { sli, steps, incidents: live, fire, status } = useLive();
  const latest = sli.at(-1);
  const availability = latest?.availability ?? 99.93;
  const breach = availability < 99.9;

  return (
    <div className="max-w-[1080px]">
      <h1 className="text-[40px] font-semibold leading-none tracking-[-0.03em]">storefront-web</h1>
      <p className="mt-3 max-w-[62ch] text-[16px] text-muted">
        {breach
          ? "Availability is under the 99.9% objective. Sentinel has a rollback ready and is waiting."
          : "Availability is inside the objective. Nothing needs you."}
      </p>

      <div className="mt-8 flex flex-wrap gap-2">
        <button type="button" onClick={() => fire("bad-deploy-advise")} className="bg-accent px-3 py-2 text-[14px] text-white">
          Replay a bad deploy
        </button>
        <button type="button" onClick={() => fire("retry-storm")} className="border border-line bg-white px-3 py-2 text-[14px]">
          Replay a retry storm
        </button>
        <button type="button" onClick={() => fire("healthy-critical-title")} className="border border-line bg-white px-3 py-2 text-[14px]">
          Replay a false alarm
        </button>
      </div>

      <section className="mt-8 bg-white px-5 py-5">
        <p className={`text-[56px] font-semibold leading-none tracking-[-0.04em] ${breach ? "text-sev1" : "text-ink"}`}>
          {availability.toFixed(2)}%
        </p>
        <p className="mt-2 text-[14px] text-muted">
          Available over the last second. Objective 99.900%. p99 {latest?.p99 ?? "—"} ms.
          {status !== "live" ? " The live feed is not connected." : ""}
        </p>
        <div className="mt-4">
          <LiveChart points={sli} />
        </div>
      </section>

      {steps.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-[18px] font-semibold">What Sentinel just did</h2>
          <ol className="mt-3 max-w-[68ch]">
            {steps.slice(0, 8).map((step) => (
              <li key={`${step.at}-${step.state}`} className="border-t border-line py-2 text-[15px]">
                <span className="text-muted">{step.state}. </span>
                {step.detail}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {live.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-[18px] font-semibold">Decided since you opened this page</h2>
          <ul className="mt-3">
            {live.map((item) => (
              <li key={`${item.id}-${item.at}`} className="border-t border-line py-2">
                <Link href={`/demo/incidents/${item.id}`} className="text-[15px] underline decoration-line underline-offset-4">
                  {item.title}
                </Link>
                <span className="text-muted">, {item.outcome}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-[18px] font-semibold">Saved situations</h2>
        <ul className="mt-3">
          {incidents.map((item) => (
            <li key={item.id} className="grid grid-cols-1 gap-1 border-t border-line py-3 sm:grid-cols-[1.4fr_90px_1fr]">
              <Link href={`/demo/incidents/${item.id}`} className="text-[15px] underline decoration-line underline-offset-4">
                {item.title}
              </Link>
              <span className={item.severity === "sev1" ? "text-sev1" : "text-ok"}>{item.severity}</span>
              <span className="text-muted">{item.reasons[0]}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
