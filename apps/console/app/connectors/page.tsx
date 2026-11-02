import { ConnectionHealth } from "../../components/connection-health";
import { ConnectorBoard } from "../../components/connector-board";
import { viewConnectors } from "../../lib/view";

export default function ConnectorsPage() {
  return <><ConnectionHealth /><ConnectorBoard items={viewConnectors()} /></>;
}
