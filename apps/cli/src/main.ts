import { CONNECTORS } from "@sentinel/connectors";
import { runIncident } from "@sentinel/engine";
import { scenarioList, scenarios } from "@sentinel/fixtures";

const command = process.argv[2] ?? "replay";
const name = process.argv[3];

if (command === "catalog") {
  console.log(`${CONNECTORS.length} connectors`);
  for (const item of CONNECTORS) {
    const env = item.authEnv.length ? item.authEnv.join(", ") : "none";
    console.log(`${item.id}\t${item.category}\t${item.writes ? "write" : "read"}\t${env}`);
  }
  process.exit(0);
}

if (command === "replay") {
  const selected = name ? scenarioList.filter((item) => item.id === name) : scenarioList;
  if (name && !(name in scenarios)) {
    console.error(`Unknown scenario ${name}. Known: ${Object.keys(scenarios).join(", ")}`);
    process.exit(1);
  }
  for (const scenario of selected) {
    const record = runIncident(scenario);
    console.log(`\n${scenario.id}  ${record.severity}  ${record.outcome}  strikes=${record.strikes}`);
    console.log(record.narrative);
    for (const event of record.events) console.log(`  ${event.state}: ${event.detail}`);
    if (record.decision.plan) {
      console.log(
        `  plan ${record.decision.plan.fromRevision} -> ${record.decision.plan.toRevision} ${record.decision.plan.planHash}`,
      );
    }
  }
  process.exit(0);
}

console.error("Usage: sentinel replay [scenario] | sentinel catalog");
process.exit(1);
