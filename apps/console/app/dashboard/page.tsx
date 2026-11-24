import Link from 'next/link';
import { Activity, Database, Plug, ShieldCheck } from 'lucide-react';
import { redirect } from 'next/navigation';
import { TrafficReplay } from '../../components/traffic-replay';
import { WorkspaceSetup } from '../../components/workspace-setup';
import { currentIdentity, getAuth } from '../../lib/auth';

export const dynamic = 'force-dynamic';

const shortcuts = [
  { href: '/incidents', title: 'Investigations', detail: 'Review incidents and collected evidence', Icon: Activity },
  { href: '/services', title: 'Service catalog', detail: 'Manage services and their objectives', Icon: Database },
  { href: '/connectors#cloudwatch-heading', title: 'Connections', detail: 'Configure monitoring and AWS sources', Icon: Plug },
];

const demoAreas = [
  { href: '/demo/showcase?view=Incidents', title: 'Investigations', detail: 'Follow an incident from alert to evidence.', Icon: Activity },
  { href: '/demo/showcase?view=Services', title: 'Service context', detail: 'See objectives and deployment context.', Icon: Database },
  { href: '/demo/showcase?view=Connectors', title: 'Connections', detail: 'Explore the sources behind the signals.', Icon: Plug },
];

export default async function Dashboard() {
  const configured = Boolean(getAuth());
  if (configured && !(await currentIdentity())) redirect('/login');

  return <div className="product-dashboard ops-dashboard desk-enter">
    {configured ? <>
      <header className="desk-title">
        <div><h1>Operations overview</h1><p>Investigate incidents, manage services, and connect evidence sources.</p></div>
        <Link className="desk-primary" href="/incidents">Open investigations</Link>
      </header>
      <nav className="desk-shortcuts" aria-label="Workspace shortcuts">
        {shortcuts.map(({href, title, detail, Icon}) => <Link href={href} key={href}>
          <Icon size={21} aria-hidden="true"/>
          <strong>{title}</strong><small>{detail}</small>
        </Link>)}
      </nav>
      <WorkspaceSetup />
    </> : <>
      <div className="signal-deck">
        <header className="signal-intro">
          <div className="signal-caption"><span /> Interactive demo · simulated data</div>
          <h1>See the signal.<br/><em>Find your focus.</em></h1>
          <p>Bring alerts, service context, and evidence together when every minute matters.</p>
          <div className="signal-actions">
            <Link className="signal-launch" href="/demo/showcase">Explore the demo</Link>
            <Link className="signal-secondary" href="/login">Set up workspace</Link>
          </div>
          <div className="signal-assurance"><ShieldCheck size={16} aria-hidden="true"/> Read-only investigations</div>
        </header>
        <TrafficReplay />
      </div>
      <div className="demo-areas-heading"><div><h2>Explore the workspace</h2><p>Choose an area to explore with sample data.</p></div><Link href="/demo/showcase">Open full demo</Link></div>
      <nav className="demo-areas" aria-label="Explore the demo workspace">
        {demoAreas.map(({href, title, detail, Icon}) => <Link href={href} className="demo-area" key={href}>
          <span className="demo-area-icon"><Icon size={22} aria-hidden="true"/></span>
          <strong>{title}</strong><span>{detail}</span>
        </Link>)}
      </nav>
      <section className="signal-setup">
        <span className="signal-setup-icon"><Plug size={21} aria-hidden="true"/></span>
        <div><h2>Bring your own signals</h2><p>Connect your workspace to services and sources such as AWS CloudWatch.</p></div>
        <Link className="desk-primary" href="/login">Set up workspace</Link>
      </section>
    </>}
  </div>;
}
