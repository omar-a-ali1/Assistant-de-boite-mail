FROM node:22

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ENV NODE_ENV=development
EXPOSE 5173

# Dev-mode container: Vite dev server with /api proxied to the backend service.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
