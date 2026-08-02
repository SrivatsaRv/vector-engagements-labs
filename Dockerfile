FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4317
CMD ["npm", "run", "start", "--", "--host", "0.0.0.0", "--port", "4317"]
