"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { LiveProvider, useLive } from "../lib/live";
import { Palette } from "./palette";

const links = [
  ["/dashboard", "Overview"],
  ["/incidents", "Incidents"],
  ["/map", "Topology"],
  ["/services", "Service"],
  ["/changes", "Changes"],
  ["/connectors", "Tools"],
  ["/lab", "Policy"],
  ["/audit", "Record"],
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  if (path === "/") return <>{children}</>;
  return (
    <LiveProvider enabled={path.startsWith("/demo")}>
      <Frame>{children}</Frame>
      <Palette demo={path.startsWith("/demo")} />
      <Toaster theme="light" position="bottom-right" />
    </LiveProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { status, sli } = useLive();
  const [clock, setClock] = useState("");
  const latest = sli.at(-1);
  const isDashboard = !path.startsWith("/demo");

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-GB", { hour12: false, timeZone: "UTC" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="console-frame grid min-h-screen grid-cols-1 md:grid-cols-[224px_minmax(0,1fr)]">
      <aside className="console-sidebar px-5 py-6 md:sticky md:top-0 md:h-screen">
        <Link href="/" className="brand text-[21px] font-semibold">
          ◉ Sentinel
        </Link>
        <p className="mt-1 text-[13px] text-muted">● Advise mode</p>
        <nav className="mt-8 flex gap-4 overflow-x-auto md:block md:space-y-1">
          {links.filter(([href]) => !isDashboard || ["/dashboard", "/connectors"].includes(href)).map(([href,label]) => [!isDashboard && href !== "/connectors" ? (href === "/dashboard" ? "/demo" : `/demo${href}`) : href,label]).map(([href, label]) => {
            const active = href === "/demo" ? path === href : path.startsWith(href);
            return (
              <Link key={href} href={href} className={`nav-item block px-3 py-2.5 text-[14px] ${active ? "nav-active font-semibold text-ink" : "text-muted"}`}>
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
      <div className="console-content min-w-0 px-6 py-6 md:px-10 md:py-8">
        <div className="mb-8 flex items-baseline justify-between gap-4 text-[13px] text-muted">
          <p>{isDashboard ? "Workspace / Setup" : "Prototype data / Demo"}</p>
          <p>
            {isDashboard ? "Production connections unavailable" : latest ? `Demo: ${latest.availability.toFixed(2)}% available, p99 ${latest.p99} ms` : "Demo feed disconnected"}
            {!isDashboard && status === "offline" ? ". Start the demo API to replay incidents." : ""}
          </p>
        </div>
        {!isDashboard && <div className="demo-banner">Prototype / demo data — this view does not show connected production systems. <Link href="/dashboard">Go to workspace</Link></div>}
        {children}
      </div>
    </div>
  );
}
