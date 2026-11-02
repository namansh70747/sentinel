import { notFound } from "next/navigation";
import { WarRoom } from "../../../../components/war-room";
import { viewIncidents } from "../../../../lib/view";

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const incident = viewIncidents().find((item) => item.id === id || item.scenarioId === id);
  if (!incident) notFound();
  return <WarRoom incident={incident} />;
}
