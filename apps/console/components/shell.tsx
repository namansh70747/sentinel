"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { LiveProvider, useLive } from "../lib/live";
import { Palette } from "./palette";

const links = [
  ["/", "Fleet"],
  ["/incidents", "Incidents"],
  ["/map", "Topology"],
  ["/services", "Service"],
  ["/changes", "Changes"],
  ["/connectors", "Tools"],
  ["/lab", "Policy"],
  ["/audit", "Record"],
];

export function Shell({ children }: { children: ReactNode }) {
  return (
    <LiveProvider>
      <Frame>{children}</Frame>
      <Palette />
      <Toaster theme="light" position="bottom-right" />
    </LiveProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { status, sli } = useLive();
  const [clock, setClock] = useState("");
  const latest = sli.at(-1);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-GB", { hour12: false, timeZone: "UTC" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)]">
      <aside className="bg-[#d4e4f7] px-5 py-6 md:sticky md:top-0 md:h-screen">
        <Link href="/" className="text-[15px] font-semibold">
          Sentinel
        </Link>
        <p className="mt-1 text-[13px] text-muted">Advise only</p>
        <nav className="mt-8 flex gap-4 overflow-x-auto md:block md:space-y-1">
          {links.map(([href, label]) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link key={href} href={href} className={`block py-1 text-[15px] ${active ? "font-semibold text-ink" : "text-muted"}`}>
                {label}
              </Link>
            );
          })}
        </nav>
        <p className="mt-10 hidden text-[13px] text-faint md:block">
          {clock ? `${clock} UTC` : ""}
          <br />
          Press ⌘K
        </p>
      </aside>
      <div className="min-w-0 bg-[#fafafa] px-6 py-6 md:px-10 md:py-8">
        <div className="mb-8 flex items-baseline justify-between gap-4 text-[13px] text-muted">
          <p>storefront-web in us-east-1. Owner Naman.</p>
          <p>
            {latest ? `${latest.availability.toFixed(2)}% available, p99 ${latest.p99} ms` : "Waiting for the service"}
            {status === "live" ? "" : status === "offline" ? ". The API is not running." : ""}
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
