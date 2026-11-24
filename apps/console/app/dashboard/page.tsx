import Link from 'next/link';
import { Activity, ArrowUpRight, FileCheck2, Layers, Radio, ShieldCheck } from 'lucide-react';
import { redirect } from 'next/navigation';
import { WorkspaceSetup } from '../../components/workspace-setup';
import { currentIdentity, getAuth } from '../../lib/auth';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const configured = Boolean(getAuth());
  if (configured && !(await currentIdentity())) redirect('/login');

  return <div className="product-dashboard ops-dashboard">
    <div className="ops-hero">
      <div className="ops-hero-copy">
        <div className="ops-mode"><Radio size={15} /> Workspace overview</div>
        <h1>Reliability<br /><em>operations.</em></h1>
        <p>Track investigations, review evidence, and manage the services your team relies on.</p>
        {configured ? <Link href="/services">Service catalog <ArrowUpRight size={16} /></Link> :
          <Link href="/demo/showcase">Open interactive demo <ArrowUpRight size={16} /></Link>}
      </div>
      <div className="ops-hero-art" aria-hidden="true">
        <div className="ops-orbit ops-orbit-outer" />
        <div className="ops-orbit ops-orbit-inner" />
        <div className="ops-hero-mark"><ShieldCheck /></div>
        <div className="ops-art-pulse"><Activity /></div>
        <span className="ops-art-spark">✦</span>
      </div>
    </div>
    <nav className="ops-shortcuts" aria-label="Workspace shortcuts">
      {(configured ? [
        { href: '/incidents', title: 'Incidents', detail: 'Queue and evidence', Icon: Activity },
        { href: '/services', title: 'Services', detail: 'Catalog and reliability objectives', Icon: Layers },
        { href: '/audit', title: 'Audit log', detail: 'Workspace activity', Icon: FileCheck2 },
      ] : [
        { href: '/demo/showcase', title: 'Interactive demo', detail: 'Explore simulated incidents', Icon: Activity },
        { href: '/login', title: 'Workspace setup', detail: 'Configure organization sign-in', Icon: Layers },
      ]).map(({ href, title, detail, Icon }) =>
        <Link href={href} key={href}>
          <span className="ops-shortcut-icon"><Icon size={20} /></span>
          <span><strong>{title}</strong><small>{detail}</small></span>
          <ArrowUpRight className="ops-shortcut-arrow" size={17} />
        </Link>
      )}
    </nav>
    {configured ? <WorkspaceSetup /> : <section className="ops-setup">
      <h2>Connect your workspace</h2>
      <p>Configure organization sign-in and a database to register services and run investigations.</p>
      <Link href="/login">View workspace setup <ArrowUpRight size={15} /></Link>
    </section>}
  </div>;
}
