FROM node:22.18.0-bookworm-slim AS runtime

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG DATABASE_URL=postgres://vector:vector@database:5432/vector
ENV DATABASE_URL=${DATABASE_URL}
RUN npm run build

EXPOSE 4317
CMD ["npx", "wrangler", "dev", "--config", "dist/server/wrangler.json", "--ip", "0.0.0.0", "--port", "4317"]
