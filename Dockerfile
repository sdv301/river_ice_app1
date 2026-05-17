# bookworm (glibc): Tailwind v4 @tailwindcss/oxide optional bindings install reliably in CI/Docker.
# Alpine + lockfile from Windows often skips linux musl binaries (npm optional-deps bug).
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci \
  && npm install --no-save @tailwindcss/oxide-linux-x64-gnu@$(node -p "require('@tailwindcss/oxide/package.json').version")

COPY . .

# Same-origin closed network defaults (override via docker-compose build args).
ARG VITE_ENABLE_EXTERNAL_NETWORK=true
ARG VITE_DATA_SOURCE=internal
ARG VITE_INTERNAL_DATA_API_BASE=/api
ARG VITE_MAP_DEFAULT_TYPE=satellite
ARG VITE_MAP_SATELLITE_TILES_URL=/api/tiles/arcgis/{z}/{y}/{x}
ARG VITE_MAP_VECTOR_STYLE_URL=https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json
ARG VITE_MAP_BASIN_STYLE_URL=/frexosm_basin_style.json
ARG VITE_MAP_ASSETS_BASE=
ARG VITE_NOMINATIM_ENABLED=false
ARG VITE_NOMINATIM_URL=
ARG VITE_YANDEX_PUBLIC_KEY=https://disk.yandex.ru/d/LENyBdYBr2B3rA

ENV VITE_ENABLE_EXTERNAL_NETWORK=$VITE_ENABLE_EXTERNAL_NETWORK
ENV VITE_DATA_SOURCE=$VITE_DATA_SOURCE
ENV VITE_INTERNAL_DATA_API_BASE=$VITE_INTERNAL_DATA_API_BASE
ENV VITE_MAP_DEFAULT_TYPE=$VITE_MAP_DEFAULT_TYPE
ENV VITE_MAP_SATELLITE_TILES_URL=$VITE_MAP_SATELLITE_TILES_URL
ENV VITE_MAP_VECTOR_STYLE_URL=$VITE_MAP_VECTOR_STYLE_URL
ENV VITE_MAP_BASIN_STYLE_URL=$VITE_MAP_BASIN_STYLE_URL
ENV VITE_MAP_ASSETS_BASE=$VITE_MAP_ASSETS_BASE
ENV VITE_NOMINATIM_ENABLED=$VITE_NOMINATIM_ENABLED
ENV VITE_NOMINATIM_URL=$VITE_NOMINATIM_URL
ENV VITE_YANDEX_PUBLIC_KEY=$VITE_YANDEX_PUBLIC_KEY

RUN npm run build

FROM nginx:1.27-alpine AS runtime
WORKDIR /usr/share/nginx/html

COPY --from=build /app/dist ./
COPY deploy/webapp.nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/index.html || exit 1
