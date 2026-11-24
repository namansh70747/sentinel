import Link from 'next/link';
import { Activity, ArrowUpRight, Cloud, Layers, Terminal } from 'lucide-react';
import { redirect } from 'next/navigation';
import { TrafficReplay } from '../../components/traffic-replay';
import { WorkspaceSetup } from '../../components/workspace-setup';
import { currentIdentity, getAuth } from '../../lib/auth';

export const dynamic = 'force-dynamic';

const shortcuts = [
  { href: '/incidents', title: 'Investigations', detail: 'Triage incidents and inspect evidence', Icon: Activity },
  { href: '/services', title: 'Service catalog', detail: 'Manage services and reliability objectives', Icon: Layers },
  { href: '/connectors#cloudwatch-heading', title: 'CloudWatch', detail: 'Map AWS services and collect metrics', Icon: Cloud },
];

export default async function Dashboard() {
  const configured = Boolean(getAuth());
  if (configured && !(await currentIdentity())) redirect('/login');

  return <div className="product-dashboard ops-dashboard desk-enter">
    {configured ? <>
      <header className="desk-title">
        <div><h1>Operations overview</h1><p>Investigate incidents, manage services, and connect evidence sources.</p></div>
        <Link className="desk-primary" href="/incidents">Open investigations <ArrowUpRight size={16}/></Link>
      </header>
      <nav className="desk-shortcuts" aria-label="Workspace shortcuts">
        {shortcuts.map(({href, title, detail, Icon}) => <Link href={href} key={href}>
          <Icon size={20} aria-hidden="true"/><ArrowUpRight className="desk-arrow" size={16} aria-hidden="true"/>
          <strong>{title}</strong><small>{detail}</small>
        </Link>)}
      </nav>
      <WorkspaceSetup />
    </> : <>
      <div className="signal-deck">
        <header className="signal-intro">
          <h1>See the incident<br/>take shape.</h1>
          <p>Follow a checkout regression from its first latency spike to the evidence behind it.</p>
          <Link className="signal-launch" href="/demo/showcase">Launch investigation demo <ArrowUpRight size={17}/></Link>
        </header>
        <TrafficReplay />
      </div>
      <section className="signal-setup">
        <div className="desk-panel-icon"><Terminal size={22} aria-hidden="true"/></div>
        <div><h2>Connect your workspace</h2><p>Sign in with organization SSO to manage services and connect evidence sources like CloudWatch.</p></div>
        <Link className="desk-primary" href="/login">Workspace setup <ArrowUpRight size={16}/></Link>
      </section>
    </>}
  </div>;
}
