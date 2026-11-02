import { FleetBoard } from "../../components/fleet-board";
import { viewIncidents } from "../../lib/view";
export default function Dashboard() { return <FleetBoard incidents={viewIncidents()} />; }
