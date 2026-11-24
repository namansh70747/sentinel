"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { LiveProvider, useLive } from "../lib/live";
import { Palette } from "./palette";
import { Activity, ArrowUpRight, Bell, BookOpen, FileCheck2, Layers, LayoutDashboard, Plug, Shield, ShieldCheck, ChevronRight } from 'lucide-react';
import './showcase.css';
import './product.css';

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
  if (path === "/" || path === "/demo/showcase") return <>{children}</>;
  if (path === '/login') return <div className="sc-app sc-auth"><main className="sc-product-content"><Link href="/" className="sc-brand"><BrandMark/>Sentinel</Link>{children}</main></div>;
  if (!path.startsWith('/demo')) return <ProductFrame>{children}<Toaster theme="light" position="bottom-right" /></ProductFrame>;
  return (
    <LiveProvider enabled={path.startsWith("/demo")}>
      <Frame>{children}</Frame>
      <Palette demo={path.startsWith("/demo")} />
      <Toaster theme="light" position="bottom-right" />
    </LiveProvider>
  );
}

function BrandMark() {
 return <span className="desk-brand-mark" aria-hidden="true"><Activity size={20} strokeWidth={2.4}/></span>;
}

function ProductFrame({children}:{children:ReactNode}) {
 const path=usePathname();
 const [signingOut,setSigningOut]=useState(false),[logoutError,setLogoutError]=useState('');
 async function signOut(){setSigningOut(true);setLogoutError('');try{const response=await fetch('/api/auth/logout',{method:'POST'});if(!response.ok)throw new Error();window.location.assign('/login');}catch{setLogoutError('Unable to sign out. Please retry.');setSigningOut(false);}}
 const items=[{href:'/dashboard',label:'Overview',icon:LayoutDashboard},{href:'/incidents',label:'Incidents',icon:Activity},{href:'/services',label:'Services',icon:Layers},{href:'/changes',label:'Changes',icon:Activity},{href:'/connectors',label:'Connectors',icon:Plug},{href:'/notifications',label:'Notifications',icon:Bell},{href:'/runbooks',label:'Runbooks',icon:BookOpen},{href:'/findings',label:'Findings',icon:Shield},{href:'/settings',label:'Settings',icon:ShieldCheck},{href:'/audit',label:'Audit log',icon:FileCheck2}];
 const active=items.find(item=>path.startsWith(item.href));
 return <div className="sc-app sc-product">
  <aside className="sc-sidebar">
   <Link href="/dashboard" className="sc-brand"><BrandMark/>Sentinel</Link>

   <span className="sc-nav-label">WORKSPACE</span>
   <nav aria-label="Product navigation">{items.map(({href,label,icon:Icon})=><Link key={href} href={href} aria-label={label} title={label} aria-current={path.startsWith(href)?'page':undefined} className={`sc-product-nav ${path.startsWith(href)?'active':''}`}><Icon size={18}/><span>{label}</span></Link>)}</nav>
   <div className="sc-sidebar-bottom"><Link className="sc-readiness" aria-label="Explore demo" title="Explore demo" href="/demo/showcase"><span>Explore demo</span><ArrowUpRight size={15}/></Link><div className="sc-safe"><ShieldCheck size={18}/><div><strong>Read-only by design</strong><small>Evidence before action</small></div></div></div>
  </aside>
  <div className="sc-main"><header className="sc-topbar"><div><span className="sc-breadcrumb">Workspace</span><ChevronRight size={14}/><strong>{active?.label??'Workspace'}</strong></div><div className="sc-header-right"><span className="sc-environment"><i/>Advise mode</span>{path!=='/login'&&<button onClick={signOut} disabled={signingOut}>{signingOut?'Signing out…':'Sign out'}</button>}</div></header>{logoutError&&<p role="alert">{logoutError}</p>}<main className="sc-content sc-product-content">{children}</main><footer className="sc-footer"><span>Sentinel</span><Link href="/demo/showcase">Open interactive demo <ArrowUpRight size={12}/></Link></footer></div>
 </div>;
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
