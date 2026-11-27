FROM oven/bun:canary AS build

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

COPY index.html tsconfig.json vite.config.ts capacitor.config.ts components.json ./
COPY public ./public
COPY src ./src
RUN bun run build

FROM caddy:2-alpine

COPY --from=build /app/dist /srv
