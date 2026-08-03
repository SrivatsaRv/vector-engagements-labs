FROM node:22.18.0-bookworm-slim AS runtime

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG DATABASE_URL=postgres://vector:vector@database:5432/vector
ARG OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
ARG VECTOR_VERSION=0.1.0
ENV DATABASE_URL=${DATABASE_URL}
ENV OTEL_EXPORTER_OTLP_ENDPOINT=${OTEL_EXPORTER_OTLP_ENDPOINT}
ENV VECTOR_VERSION=${VECTOR_VERSION}
ENV VECTOR_ENVIRONMENT=local
RUN npm run build

EXPOSE 4317
CMD ["npx", "wrangler", "dev", "--config", "dist/server/wrangler.json", "--ip", "0.0.0.0", "--port", "4317"]
