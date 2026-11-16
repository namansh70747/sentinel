# Local configuration

Copy `.env.example` to `.env` in the repository root. `.env` is gitignored. Tell the person running the loop that the file exists. Do not paste it into chat.

Leave `SENTINEL_ECS_MODE=simulated` until a sandbox role exists. Then add `AWS_REGION`, `SENTINEL_AWS_ACCOUNT_ID`, `SENTINEL_READ_ROLE_ARN`, and `SENTINEL_ECS_SERVICE_ARN` to the same file and say the AWS values are in `.env`. Do not put access keys in chat. A static key, if that is all the sandbox has, belongs in the AWS CLI profile `sentinel-sandbox`.

`ops/keycloak/sentinel-realm.json` contains a local-only operator password. Change it before anyone else uses this machine.
