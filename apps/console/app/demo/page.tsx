import { FleetBoard } from "../../components/fleet-board";
import { viewIncidents } from "../../lib/view";
export default function Dashboard() { return <><a href="/demo/showcase" className="product-button" style={{display:"inline-block",marginBottom:20}}>Open credential-free presentation demo →</a><FleetBoard incidents={viewIncidents()} /></>; }
