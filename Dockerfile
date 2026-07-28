FROM node:20-alpine

WORKDIR /app

# Install dependencies (devDeps included: vite, tsx, concurrently, vitest).
# Source is NOT copied here — it is bind-mounted at runtime (see docker-compose.yml)
# so that host saves trigger Vite HMR / tsx watch directly.
COPY package.json package-lock.json ./
RUN npm install

# Vite dev server (5233). Express (:3001) is reached in-container via the
# Vite /api proxy, so only 5233 needs to be exposed to Traefik.
EXPOSE 5233

# Vite + Express concurrently (HMR + live API).
CMD ["npm", "run", "dev:all"]
