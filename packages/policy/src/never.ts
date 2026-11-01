export const NEVER_VERBS = [
  "iam:AttachRolePolicy",
  "iam:PutRolePolicy",
  "iam:CreatePolicy",
  "ec2:AuthorizeSecurityGroupIngress",
  "ec2:AuthorizeSecurityGroupEgress",
  "route53:ChangeResourceRecordSets",
  "s3:DeleteObject",
  "s3:PutObject",
  "dynamodb:DeleteItem",
  "dynamodb:PutItem",
  "dynamodb:UpdateItem",
  "rds:DeleteDBInstance",
  "rds:ModifyDBInstance",
  "rds:RestoreDBInstanceFromDBSnapshot",
  "secretsmanager:PutSecretValue",
  "secretsmanager:GetSecretValue",
  "kms:Decrypt",
  "kms:ScheduleKeyDeletion",
  "servicequotas:RequestServiceQuotaIncrease",
  "budgets:ModifyBudget",
  "cloudformation:ExecuteChangeSet",
  "ec2:RunInstances",
] as const;

export type NeverVerb = (typeof NEVER_VERBS)[number];

const neverSet = new Set<string>(NEVER_VERBS);

export function isNeverVerb(verb: string): boolean {
  return neverSet.has(verb);
}
