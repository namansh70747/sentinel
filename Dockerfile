FROM node:24-bookworm-slim AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/approvals/package.json ./packages/approvals/package.json
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/connectors/package.json ./packages/connectors/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/engine/package.json ./packages/engine/package.json
COPY packages/fixtures/package.json ./packages/fixtures/package.json
COPY packages/mcp-read/package.json ./packages/mcp-read/package.json
COPY packages/policy/package.json ./packages/policy/package.json
COPY packages/workflows/package.json ./packages/workflows/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/cli/package.json ./apps/cli/package.json
COPY apps/console/package.json ./apps/console/package.json
COPY apps/worker-read/package.json ./apps/worker-read/package.json
COPY apps/worker-communication/package.json ./apps/worker-communication/package.json
COPY apps/workload/package.json ./apps/workload/package.json
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .

FROM node:24-bookworm-slim AS workload
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/workload/package.json ./apps/workload/package.json
RUN npm ci --workspace=@sentinel/workload --include-workspace-root=false --omit=dev
COPY apps/workload ./apps/workload
ENV SENTINEL_WORKLOAD_MODE=local
EXPOSE 9464
CMD ["node", "--import", "tsx", "apps/workload/server.mjs"]

FROM base AS api
ENV SENTINEL_PORT=8787
EXPOSE 8787
CMD ["node", "--import", "tsx", "apps/api/src/main.ts"]

FROM base AS migrate
CMD ["sh", "-c", "npm run db:migrate && npm run db:provision"]

FROM base AS worker-read
CMD ["node", "--import", "tsx", "apps/worker-read/src/main.ts"]

FROM base AS worker-communication
CMD ["node", "--import", "tsx", "apps/worker-communication/src/main.ts"]

FROM base AS console-build
ARG NEXT_PUBLIC_API_URL=http://localhost:8787
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build -w @sentinel/console

FROM console-build AS console
ENV NODE_ENV=production
EXPOSE 3010
CMD ["npm", "run", "start", "-w", "@sentinel/console"]
