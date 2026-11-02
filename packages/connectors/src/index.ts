export type Capability =
  | "metrics"
  | "logs"
  | "traces"
  | "profiles"
  | "alerts"
  | "paging"
  | "oncall"
  | "chat"
  | "ticket"
  | "status"
  | "source"
  | "ci"
  | "deploy"
  | "gitops"
  | "iac"
  | "flags"
  | "catalog"
  | "k8s"
  | "security"
  | "cost"
  | "docs"
  | "data";

export interface ConnectorManifest {
  id: string;
  name: string;
  category: string;
  capabilities: Capability[];
  authEnv: string[];
  writes: boolean;
}

function c(
  id: string,
  name: string,
  category: string,
  capabilities: Capability[],
  authEnv: string[],
  writes = false,
): ConnectorManifest {
  return { id, name, category, capabilities, authEnv, writes };
}

export const CONNECTORS: ConnectorManifest[] = [
  c("otel", "OpenTelemetry", "telemetry", ["metrics", "logs", "traces"], ["OTEL_EXPORTER_OTLP_ENDPOINT"]),
  c("prometheus", "Prometheus", "telemetry", ["metrics", "alerts"], ["PROMETHEUS_URL"]),
  c("mimir", "Grafana Mimir", "telemetry", ["metrics"], ["GRAFANA_URL", "GRAFANA_TOKEN"]),
  c("grafana", "Grafana", "telemetry", ["metrics", "logs", "traces", "alerts"], ["GRAFANA_URL", "GRAFANA_TOKEN"]),
  c("loki", "Grafana Loki", "telemetry", ["logs"], ["GRAFANA_URL", "GRAFANA_TOKEN"]),
  c("tempo", "Grafana Tempo", "telemetry", ["traces"], ["GRAFANA_URL", "GRAFANA_TOKEN"]),
  c("pyroscope", "Grafana Pyroscope", "telemetry", ["profiles"], ["GRAFANA_URL", "GRAFANA_TOKEN"]),
  c("cloudwatch", "Amazon CloudWatch", "telemetry", ["metrics", "logs", "alerts"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("xray", "AWS X-Ray", "telemetry", ["traces"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("datadog", "Datadog", "telemetry", ["metrics", "logs", "traces", "alerts"], ["DATADOG_API_KEY", "DATADOG_APP_KEY"]),
  c("newrelic", "New Relic", "telemetry", ["metrics", "traces", "alerts"], ["NEW_RELIC_API_KEY"]),
  c("dynatrace", "Dynatrace", "telemetry", ["metrics", "traces", "alerts"], ["DYNATRACE_URL", "DYNATRACE_TOKEN"]),
  c("splunk", "Splunk", "telemetry", ["logs", "alerts"], ["SPLUNK_URL", "SPLUNK_TOKEN"]),
  c("elastic", "Elasticsearch", "telemetry", ["logs"], ["ELASTIC_URL", "ELASTIC_API_KEY"]),
  c("opensearch", "OpenSearch", "telemetry", ["logs"], ["OPENSEARCH_URL"]),
  c("honeycomb", "Honeycomb", "telemetry", ["traces", "alerts"], ["HONEYCOMB_API_KEY"]),
  c("sentry", "Sentry", "telemetry", ["alerts"], ["SENTRY_AUTH_TOKEN"]),
  c("chronosphere", "Chronosphere", "telemetry", ["metrics"], ["CHRONOSPHERE_API_TOKEN"]),
  c("coralogix", "Coralogix", "telemetry", ["logs"], ["CORALOGIX_API_KEY"]),
  c("sumologic", "Sumo Logic", "telemetry", ["logs"], ["SUMO_ACCESS_ID", "SUMO_ACCESS_KEY"]),
  c("jaeger", "Jaeger", "telemetry", ["traces"], ["JAEGER_URL"]),
  c("checkly", "Checkly", "telemetry", ["alerts"], ["CHECKLY_API_KEY"]),
  c("obi", "OpenTelemetry eBPF", "telemetry", ["metrics", "traces"], []),
  c("coroot", "Coroot", "telemetry", ["metrics", "traces"], ["COROOT_URL"]),
  c("pixie", "Pixie", "telemetry", ["traces", "profiles"], ["PIXIE_API_KEY"]),
  c("hubble", "Cilium Hubble", "telemetry", ["traces"], []),
  c("clickhouse", "ClickHouse", "telemetry", ["logs", "data"], ["CLICKHOUSE_URL"]),
  c("pagerduty", "PagerDuty", "paging", ["paging", "oncall"], ["PAGERDUTY_API_TOKEN"], true),
  c("opsgenie", "Opsgenie", "paging", ["paging", "oncall"], ["OPSGENIE_API_KEY"], true),
  c("grafana-oncall", "Grafana OnCall", "paging", ["paging", "oncall"], ["GRAFANA_TOKEN"], true),
  c("incident-io", "incident.io", "paging", ["paging", "status"], ["INCIDENT_IO_API_KEY"], true),
  c("rootly", "Rootly", "paging", ["paging"], ["ROOTLY_API_KEY"], true),
  c("firehydrant", "FireHydrant", "paging", ["paging"], ["FIREHYDRANT_API_KEY"], true),
  c("aws-incident-manager", "AWS Incident Manager", "paging", ["paging"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("alertmanager", "Alertmanager", "paging", ["alerts"], ["ALERTMANAGER_URL"]),
  c("slack", "Slack", "chat", ["chat"], ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"], true),
  c("teams", "Microsoft Teams", "chat", ["chat"], ["TEAMS_WEBHOOK_URL"], true),
  c("google-chat", "Google Chat", "chat", ["chat"], ["GOOGLE_CHAT_WEBHOOK"], true),
  c("ses", "Amazon SES", "chat", ["chat"], ["AWS_REGION"], true),
  c("jira", "Jira", "ticket", ["ticket"], ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"], true),
  c("linear", "Linear", "ticket", ["ticket"], ["LINEAR_API_KEY"], true),
  c("github-issues", "GitHub Issues", "ticket", ["ticket", "source"], ["GITHUB_TOKEN"], true),
  c("gitlab", "GitLab", "source", ["source", "ci"], ["GITLAB_TOKEN"]),
  c("servicenow", "ServiceNow", "ticket", ["ticket"], ["SERVICENOW_INSTANCE", "SERVICENOW_TOKEN"], true),
  c("zendesk", "Zendesk", "ticket", ["ticket"], ["ZENDESK_SUBDOMAIN", "ZENDESK_TOKEN"]),
  c("statuspage", "Statuspage", "status", ["status"], ["STATUSPAGE_API_KEY", "STATUSPAGE_PAGE_ID"], true),
  c("github", "GitHub", "source", ["source", "ci", "deploy"], ["GITHUB_TOKEN"], true),
  c("bitbucket", "Bitbucket", "source", ["source"], ["BITBUCKET_TOKEN"]),
  c("github-actions", "GitHub Actions", "cicd", ["ci", "deploy"], ["GITHUB_TOKEN"]),
  c("jenkins", "Jenkins", "cicd", ["ci"], ["JENKINS_URL", "JENKINS_TOKEN"]),
  c("circleci", "CircleCI", "cicd", ["ci"], ["CIRCLECI_TOKEN"]),
  c("codepipeline", "AWS CodePipeline", "cicd", ["ci", "deploy"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("codedeploy", "AWS CodeDeploy", "cicd", ["deploy"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"], true),
  c("argocd", "Argo CD", "gitops", ["gitops", "deploy"], ["ARGOCD_SERVER", "ARGOCD_TOKEN"], true),
  c("argo-rollouts", "Argo Rollouts", "gitops", ["deploy"], ["ARGOCD_TOKEN"], true),
  c("flux", "Flux", "gitops", ["gitops"], []),
  c("flagger", "Flagger", "gitops", ["deploy"], []),
  c("helm", "Helm", "gitops", ["deploy"], [], true),
  c("terraform", "Terraform", "iac", ["iac"], []),
  c("opentofu", "OpenTofu", "iac", ["iac"], []),
  c("cloudformation", "CloudFormation", "iac", ["iac"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("pulumi", "Pulumi", "iac", ["iac"], ["PULUMI_ACCESS_TOKEN"]),
  c("crossplane", "Crossplane", "iac", ["iac", "k8s"], []),
  c("launchdarkly", "LaunchDarkly", "flags", ["flags"], ["LAUNCHDARKLY_TOKEN"], true),
  c("unleash", "Unleash", "flags", ["flags"], ["UNLEASH_URL", "UNLEASH_TOKEN"], true),
  c("appconfig", "AWS AppConfig", "flags", ["flags"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"], true),
  c("openfeature", "OpenFeature", "flags", ["flags"], []),
  c("backstage", "Backstage", "catalog", ["catalog"], ["BACKSTAGE_URL", "BACKSTAGE_TOKEN"]),
  c("port", "Port", "catalog", ["catalog"], ["PORT_CLIENT_ID", "PORT_CLIENT_SECRET"]),
  c("cortex", "Cortex", "catalog", ["catalog"], ["CORTEX_API_TOKEN"]),
  c("opslevel", "OpsLevel", "catalog", ["catalog"], ["OPSLEVEL_API_TOKEN"]),
  c("kubernetes", "Kubernetes", "k8s", ["k8s"], [], true),
  c("istio", "Istio", "k8s", ["k8s", "traces"], []),
  c("cert-manager", "cert-manager", "k8s", ["k8s"], []),
  c("kyverno", "Kyverno", "k8s", ["k8s", "security"], []),
  c("velero", "Velero", "k8s", ["k8s"], []),
  c("k8sgpt", "k8sgpt", "k8s", ["k8s"], []),
  c("holmesgpt", "HolmesGPT", "agents", ["k8s", "metrics", "logs"], ["BEDROCK_RANK_MODEL_ID"]),
  c("guardduty", "GuardDuty", "security", ["security"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("security-hub", "Security Hub", "security", ["security"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("prowler", "Prowler", "security", ["security"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("wiz", "Wiz", "security", ["security"], ["WIZ_CLIENT_ID", "WIZ_CLIENT_SECRET"]),
  c("snyk", "Snyk", "security", ["security"], ["SNYK_TOKEN"]),
  c("trivy", "Trivy", "security", ["security"], []),
  c("cost-explorer", "AWS Cost Explorer", "cost", ["cost"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("cur", "Cost and Usage Report", "cost", ["cost"], ["CUR_ATHENA_DATABASE"]),
  c("infracost", "Infracost", "cost", ["cost", "iac"], ["INFRACOST_API_KEY"]),
  c("opencost", "OpenCost", "cost", ["cost", "k8s"], ["OPENCOST_URL"]),
  c("kubecost", "Kubecost", "cost", ["cost", "k8s"], ["KUBECOST_URL"]),
  c("steampipe", "Steampipe", "inventory", ["iac", "security"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("cloudquery", "CloudQuery", "inventory", ["iac"], ["DATABASE_URL"]),
  c("cartography", "Cartography", "inventory", ["iac"], ["CARTOGRAPHY_NEO4J_URL"]),
  c("cloud-custodian", "Cloud Custodian", "inventory", ["security", "cost"], []),
  c("confluence", "Confluence", "docs", ["docs"], ["CONFLUENCE_URL", "CONFLUENCE_TOKEN"]),
  c("notion", "Notion", "docs", ["docs"], ["NOTION_TOKEN"]),
  c("rds", "Amazon RDS", "data", ["data", "metrics"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("dynamodb", "DynamoDB", "data", ["data", "metrics"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("elasticache", "ElastiCache", "data", ["data", "metrics"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("sqs", "Amazon SQS", "data", ["data", "metrics"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("msk", "Amazon MSK", "data", ["data", "metrics"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("aws-health", "AWS Health", "aws", ["alerts"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("service-quotas", "Service Quotas", "aws", ["metrics"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("cloudtrail", "CloudTrail", "aws", ["logs"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("aws-config", "AWS Config", "aws", ["iac"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("trusted-advisor", "Trusted Advisor", "aws", ["security", "cost"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("route53", "Route 53", "aws", ["metrics"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("elb", "Elastic Load Balancing", "aws", ["metrics"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("ecs", "Amazon ECS", "aws", ["deploy", "metrics"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"], true),
  c("eks", "Amazon EKS", "aws", ["k8s", "deploy"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"], true),
  c("lambda", "AWS Lambda", "aws", ["deploy", "metrics"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"], true),
  c("acm", "AWS Certificate Manager", "aws", ["security"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("backup", "AWS Backup", "aws", ["data"], ["AWS_REGION", "SENTINEL_READ_ROLE_ARN"]),
  c("fis", "AWS Fault Injection Service", "chaos", ["deploy"], ["AWS_REGION"], true),
  c("chaos-mesh", "Chaos Mesh", "chaos", ["k8s"], [], true),
  c("litmus", "LitmusChaos", "chaos", ["k8s"], [], true),
  c("krkn", "Krkn", "chaos", ["k8s"], [], true),
  c("langfuse", "Langfuse", "llm", ["traces"], ["LANGFUSE_HOST", "LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"]),
  c("openfga", "OpenFGA", "auth", ["catalog"], ["OPENFGA_API_URL"]),
];

export function connectorById(id: string): ConnectorManifest | undefined {
  return CONNECTORS.find((item) => item.id === id);
}

export function missingEnv(manifest: ConnectorManifest, env: NodeJS.ProcessEnv = process.env): string[] {
  return manifest.authEnv.filter((key) => !env[key]);
}

export { PrometheusClient } from './prometheus';
export type { PrometheusConfig, PrometheusSample } from './prometheus';
export { collectSlo } from './slo';
export type { SloMapping } from './slo';
export { GitHubReadClient } from './github';
export { normalizeGrafanaAlerts } from './grafana-alerts';
export { EcsReadClient,parseEcsServiceArn } from './ecs-read';
