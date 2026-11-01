FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/policy/package.json packages/policy/
COPY packages/engine/package.json packages/engine/
COPY packages/fixtures/package.json packages/fixtures/
COPY packages/connectors/package.json packages/connectors/
COPY apps/api/package.json apps/api/
COPY apps/cli/package.json apps/cli/
COPY apps/console/package.json apps/console/
RUN npm ci
COPY . .

FROM base AS api
ENV SENTINEL_PORT=8787
EXPOSE 8787
CMD ["npx", "tsx", "apps/api/src/main.ts"]

FROM base AS console-build
ARG NEXT_PUBLIC_API_URL=http://localhost:8787
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build -w @sentinel/console

FROM console-build AS console
ENV NODE_ENV=production
EXPOSE 3010
CMD ["npm", "run", "start", "-w", "@sentinel/console"]
