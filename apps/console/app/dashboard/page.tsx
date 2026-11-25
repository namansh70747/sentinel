import Link from 'next/link';
import { Activity, Database, Plug, ShieldCheck } from 'lucide-react';
import { redirect } from 'next/navigation';
import { TrafficReplay } from '../../components/traffic-replay';
import { CreateWorkspace, WorkspaceDashboardEntry } from '../../components/workspace-dashboard-entry';
import { dashboardMemberships } from '../../lib/role-dashboard-access';
import { roleDashboardHref } from '../../lib/workspace-role';

export const dynamic = 'force-dynamic';

const demoAreas = [
  { href: '/demo/showcase?view=Incidents', title: 'Investigations', detail: 'Follow an incident from alert to evidence.', Icon: Activity },
  { href: '/demo/showcase?view=Services', title: 'Service context', detail: 'See objectives and deployment context.', Icon: Database },
  { href: '/demo/showcase?view=Connectors', title: 'Connections', detail: 'Explore the sources behind the signals.', Icon: Plug },
];

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ create?: string }> }) {
  const memberships = await dashboardMemberships();
  if (memberships) {
    if (!memberships.length || (await searchParams).create === '1') return <CreateWorkspace hasWorkspaces={memberships.length > 0}/>;
    if (memberships.length === 1) redirect(roleDashboardHref(memberships[0]));
    return <WorkspaceDashboardEntry memberships={memberships}/>;
  }

  return <div className="product-dashboard ops-dashboard desk-enter">
      <div className="signal-deck">
        <header className="signal-intro">
          <div className="signal-caption"><span /> Interactive demo · simulated data</div>
          <h1>See the signal.<br/><em>Find your focus.</em></h1>
          <p>Bring alerts, service context, and evidence together when every minute matters.</p>
          <div className="signal-actions">
            <Link className="signal-launch" href="/demo/showcase">Explore the demo</Link>
            <Link className="signal-secondary" href="/demo/showcase?present=1">Presentation mode</Link>
          </div>
          <div className="signal-assurance"><ShieldCheck size={16} aria-hidden="true"/> Read-only investigations</div>
        </header>
        <TrafficReplay />
      </div>
      <div className="demo-areas-heading"><div><h2>Explore the workspace</h2><p>Choose an area to explore with sample data.</p></div><Link href="/demo/roles/admin">Explore role dashboards</Link></div>
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
  </div>;
}
