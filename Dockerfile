FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev
FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8000
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 8000
CMD ["node", "server/index.js"]
