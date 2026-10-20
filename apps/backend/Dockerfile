FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
EXPOSE 4000

# Run pending SQL migrations before accepting traffic, then start the API.
ENTRYPOINT ["sh", "-c", "node database/migrate.js && node server.js"]
