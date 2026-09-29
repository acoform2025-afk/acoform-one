# ACOFORM ONE — Docker image (Render sets $PORT; defaults to 7860)

# --- GNU LibreDWG (open source, GPL-3): provides `dwg2dxf` so AutoCAD .dwg floor plans can be read.
#     Runs as a separate program; built in its own stage so it is cached between deploys.
FROM node:22-slim AS libredwg
ARG LIBREDWG_VERSION=0.14.8597
ARG LIBREDWG_SHA256=af2646681858a78d756cfb9e0eeb6901f61be3d09ae8f56a98e94b1490dec4ed
RUN apt-get update && apt-get install -y --no-install-recommends build-essential ca-certificates curl xz-utils \
 && curl -fsSL -o /tmp/libredwg.tar.xz "https://github.com/LibreDWG/libredwg/releases/download/${LIBREDWG_VERSION}/libredwg-${LIBREDWG_VERSION}.tar.xz" \
 && echo "${LIBREDWG_SHA256}  /tmp/libredwg.tar.xz" | sha256sum -c - \
 && tar -xJf /tmp/libredwg.tar.xz -C /tmp \
 && cd /tmp/libredwg-${LIBREDWG_VERSION} \
 && ./configure --prefix=/opt/libredwg --disable-bindings --disable-python --disable-docs \
 && make -j"$(nproc)" && make install \
 && rm -rf /tmp/libredwg* /var/lib/apt/lists/*

FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Public Supabase values (safe to ship to the browser). Override with Space variables if they change.
ARG NEXT_PUBLIC_SUPABASE_URL=https://hxlkinnosgckehogtpgb.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_rCYgzLXbGnHGmNqT3zxCfA_tdyQ0b_h
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=7860 HOSTNAME=0.0.0.0 \
    PATH=/opt/libredwg/bin:$PATH LD_LIBRARY_PATH=/opt/libredwg/lib DWG2DXF_BIN=/opt/libredwg/bin/dwg2dxf
COPY --from=libredwg /opt/libredwg/bin/dwg2dxf /opt/libredwg/bin/dwg2dxf
COPY --from=libredwg /opt/libredwg/lib/ /opt/libredwg/lib/
COPY --from=build /app /app
# run as a non-root user
RUN chown -R 1000:1000 /app && /opt/libredwg/bin/dwg2dxf --version
USER 1000
EXPOSE 7860
CMD ["sh", "-c", "exec node_modules/.bin/next start -p ${PORT:-7860} -H 0.0.0.0"]
