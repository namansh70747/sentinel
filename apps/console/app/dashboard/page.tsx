import Link from 'next/link';
import { Activity, ArrowDownRight, ArrowUpRight, Cloud, Layers, Radio, Terminal } from 'lucide-react';
import { redirect } from 'next/navigation';
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

  return <div className="product-dashboard ops-dashboard">
    <header className="desk-title">
      <div><h1>Operations overview</h1><p>Investigate incidents, manage services, and connect evidence sources.</p></div>
      {configured && <Link className="desk-primary" href="/incidents">Open investigations <ArrowUpRight size={16}/></Link>}
    </header>
    {configured ? <>
      <nav className="desk-shortcuts" aria-label="Workspace shortcuts">
        {shortcuts.map(({href, title, detail, Icon}) => <Link href={href} key={href}>
          <Icon size={20} aria-hidden="true"/><ArrowUpRight className="desk-arrow" size={16} aria-hidden="true"/>
          <strong>{title}</strong><small>{detail}</small>
        </Link>)}
      </nav>
      <WorkspaceSetup />
    </> : <div className="desk-onboarding">
      <section className="desk-setup">
        <div className="desk-panel-icon"><Terminal size={22} aria-hidden="true"/></div>
        <h2>Connect your workspace</h2>
        <p>Configure organization sign-in and a database to register services and start read-only investigations.</p>
        <Link className="desk-primary" href="/login">Open workspace setup <ArrowUpRight size={16}/></Link>
      </section>
      <section className="desk-demo">
        <Radio size={28} aria-hidden="true"/>
        <div><h2>Explore a sample incident</h2><p>Follow a simulated investigation from alert to evidence.</p></div>
        <Link href="/demo/showcase">Launch demo <ArrowDownRight size={16}/></Link>
      </section>
    </div>}
  </div>;
}
