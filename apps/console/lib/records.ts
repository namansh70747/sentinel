import { CONNECTORS } from "@sentinel/connectors";
import { runIncident } from "@sentinel/engine";
import { scenarioList, storefront } from "@sentinel/fixtures";

export const records = scenarioList.map((scenario) => ({
  scenario,
  record: runIncident(scenario),
}));

export const service = storefront;
export const connectors = CONNECTORS;

export function findRecord(id: string) {
  return records.find((item) => item.record.id === id || item.scenario.id === id);
}
