import { FleetBoard } from "../components/fleet-board";
import { viewIncidents } from "../lib/view";

export default function Overview() {
  return <FleetBoard incidents={viewIncidents()} />;
}
