"use client";

import { useEffect, useState } from "react";
import type { ViewIncident } from "../lib/view";
import { SliChart, availabilitySeries } from "./spark";

export function WarRoom({ incident }: { incident: ViewIncident }) {
  const total = incident.events.length;
  const [shown, setShown] = useState(1);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || shown >= total) {
      if (shown >= total) setPlaying(false);
      return;
    }
    const id = setTimeout(() => setShown((value) => value + 1), 900);
    return () => clearTimeout(id);
  }, [playing, shown, total]);

  const visible = incident.events.slice(0, shown);
  const finished = shown >= total;

  return (
    <article className="max-w-[920px]">
      <h1 className="text-[36px] font-semibold leading-none tracking-[-0.03em]">{incident.title}</h1>
      <p className="mt-3 max-w-[68ch] text-[16px] text-muted">{incident.narrative}</p>

      <div className="mt-6 flex flex-wrap items-center gap-3 text-[14px]">
        <button
          type="button"
          onClick={() => {
            if (shown >= total) setShown(1);
            setPlaying(true);
          }}
          className="bg-accent px-3 py-2 text-white"
        >
          {playing ? "Playing" : shown >= total ? "Play again" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => setPlaying(false)}
          className="border border-line bg-white px-3 py-2"
        >
          Pause
        </button>
        <label className="text-muted">
          Step {shown} of {total}
          <input
            type="range"
            min={1}
            max={total}
            value={shown}
            onChange={(event) => {
              setPlaying(false);
              setShown(Number(event.target.value));
            }}
            className="ml-3 align-middle"
            aria-label="Scrub the incident timeline"
          />
        </label>
      </div>

      <section className="mt-8 bg-white px-5 py-4">
        <SliChart values={availabilitySeries(incident.severity)} markerAt={incident.severity === "sev4" ? 47 : 34} />
        <p className="mt-2 text-[14px] text-muted">
          {incident.opening}. The alarm was titled “{incident.alarm}”. Severity ignores that title.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-[18px] font-semibold">Trace</h2>
        <ol className="mt-3">
          {visible.map((event, index) => (
            <li key={`${event.state}-${index}`} className="border-t border-line py-2 text-[15px]">
              <span className="text-muted">{event.state}. </span>
              {event.detail}
            </li>
          ))}
        </ol>
      </section>

      {finished && incident.ranked.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-[18px] font-semibold">What was considered</h2>
          <ul className="mt-3">
            {incident.ranked.map((item) => (
              <li key={item.class} className="border-t border-line py-3">
                <p>
                  {item.class}{" "}
                  <span className={item.status === "kept" ? "text-sev1" : "text-ok"}>{item.status}</span>
                </p>
                <p className="max-w-[68ch] text-muted">{item.because}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {finished ? (
        <section className="mt-8">
          <h2 className="text-[18px] font-semibold">Decision: {incident.decision}</h2>
          <ul className="mt-3 max-w-[68ch] list-disc pl-5 text-[15px]">
            {incident.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {incident.plan ? (
            <pre className="mt-4 max-w-[68ch] overflow-x-auto bg-[#1a2330] p-4 text-[13px] leading-6 text-white">
{`rollback-last-deploy
- ${incident.plan.from}
+ ${incident.plan.to}
desired count unchanged
${incident.plan.hash}`}
            </pre>
          ) : (
            <p className="mt-3 text-muted">No change will be made.</p>
          )}
          <button type="button" disabled className="mt-4 border border-line px-3 py-2 text-[14px] text-muted">
            Approve is off while Sentinel is in advise
          </button>
        </section>
      ) : (
        <p className="mt-8 text-muted">Sentinel is still working through the trace.</p>
      )}
    </article>
  );
}
