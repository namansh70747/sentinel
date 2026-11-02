FROM node:24-bookworm-slim AS base
WORKDIR /app
COPY . .
RUN npm ci

FROM base AS api
ENV SENTINEL_PORT=8787
EXPOSE 8787
CMD ["node", "--import", "tsx", "apps/api/src/main.ts"]

FROM base AS migrate
CMD ["sh", "-c", "npm run db:migrate && npm run db:provision"]

FROM base AS worker-read
CMD ["node", "--import", "tsx", "apps/worker-read/src/main.ts"]

FROM base AS console-build
ARG NEXT_PUBLIC_API_URL=http://localhost:8787
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build -w @sentinel/console

FROM console-build AS console
ENV NODE_ENV=production
EXPOSE 3010
CMD ["npm", "run", "start", "-w", "@sentinel/console"]
