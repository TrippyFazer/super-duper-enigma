# TFHealth (Ascend) — production image.
FROM node:22-bookworm-slim AS build
# better-sqlite3 has no prebuilt binary for every Node release; build it here.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Dev dependencies stay: next start reads next.config.ts, which needs TypeScript.
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 DATABASE_PATH=/data/ascend.db
COPY --from=build /app ./
RUN mkdir -p /data && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["npm", "start"]
