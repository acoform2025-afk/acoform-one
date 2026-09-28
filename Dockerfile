# ACOFORM ONE — Docker image (Render sets $PORT; defaults to 7860)
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
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=7860 HOSTNAME=0.0.0.0
COPY --from=build /app /app
# run as a non-root user
RUN chown -R 1000:1000 /app
USER 1000
EXPOSE 7860
CMD ["sh", "-c", "exec node_modules/.bin/next start -p ${PORT:-7860} -H 0.0.0.0"]
