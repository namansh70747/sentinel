import { WorkspaceSetup } from "../../components/workspace-setup";
export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { currentIdentity, getAuth } from "../../lib/auth";
import Link from "next/link";

export default async function Dashboard() {
  const configured = Boolean(getAuth());
  if (configured && !(await currentIdentity())) redirect("/login");
  if (configured) return <main className="product-dashboard"><h1>Your workspace</h1><p className="product-lead">Register services and connect your operational tools.</p><WorkspaceSetup /></main>;
  return <main className="product-dashboard"><div className="product-kicker">Your workspace</div><h1>Welcome to Sentinel.</h1><p className="product-lead">Connect your infrastructure to start building a clear picture of service health.</p><div className="setup-panel"><span className="setup-icon">✳</span><div><h2>Set up your workspace</h2><p>Organization sign-in and the database are not configured on this server. Configure them to create a workspace and register services.</p><Link className="product-button" href="/login">Configure organization sign-in</Link><Link className="product-link" href="/demo">Explore the demo instead ↗</Link></div></div><div className="dashboard-grid"><section><h2>Service health</h2><p>No services connected yet.</p></section><section><h2>Recent incidents</h2><p>No production incidents available.</p></section><section><h2>Approvals</h2><p>Production approvals are not available yet.</p></section></div></main>;
}
