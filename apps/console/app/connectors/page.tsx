import { ConnectorBoard } from "../../components/connector-board";
import { viewConnectors } from "../../lib/view";

export default function ConnectorsPage() {
  return <ConnectorBoard items={viewConnectors()} />;
}
