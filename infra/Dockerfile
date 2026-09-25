FROM node:22.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci
RUN npm run build

FROM build AS api
ENV NODE_ENV=production
USER node
CMD ["node","apps/api/dist/server.js"]

FROM caddy:2.10.2-alpine AS web
COPY --from=build /app/apps/web/dist /srv
COPY infra/Caddyfile /etc/caddy/Caddyfile
