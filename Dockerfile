FROM node:20-alpine

WORKDIR /app

# git needed for repo clone/pull sync
RUN apk add --no-cache git

# Install dependencies (devDeps included: vite, tsx, concurrently, vitest).
COPY package.json package-lock.json ./
RUN npm install

# Vite dev server (5233). Express (:3001) reached via Vite /api proxy.
EXPOSE 5233

# Vite + Express concurrently (HMR + live API).
CMD ["npm", "run", "dev:all"]
