FROM node:22.18.0-bookworm-slim@sha256:752ea8a2f758c34002a0461bd9f1cee4f9a3c36d48494586f60ffce1fc708e0e AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
ARG VECTOR_VERSION=0.1.0
ENV VECTOR_VERSION=${VECTOR_VERSION}
RUN npm run build

FROM base AS runtime

ARG VECTOR_VERSION=0.1.0
ARG VECTOR_SOURCE_REVISION=unknown
LABEL org.opencontainers.image.title="Vector Engagement Labs" \
  org.opencontainers.image.description="Browser-first engagement simulation and analysis platform" \
  org.opencontainers.image.source="https://github.com/SrivatsaRv/vector-engagements-labs" \
  org.opencontainers.image.version="${VECTOR_VERSION}" \
  org.opencontainers.image.revision="${VECTOR_SOURCE_REVISION}" \
  org.opencontainers.image.licenses="Apache-2.0"

ENV NODE_ENV=production \
  PORT=4317 \
  HOST=0.0.0.0 \
  VECTOR_VERSION=${VECTOR_VERSION}

COPY package.json package-lock.json ./
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/db/migrations ./db/migrations

USER node
EXPOSE 4317
CMD ["node", "dist/runtime/start-production.mjs"]
