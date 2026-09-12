# Minimal Next.js production image (standalone).
# Build: docker build -t smt-website:local /path/to/website

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
# pnpm 11 ignores dependency build scripts unless approved; allow for Docker.
RUN pnpm config set dangerouslyAllowAllBuilds true \
  && pnpm install --frozen-lockfile

FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# SESSION_SECRET only needed at runtime; stub for any build-time imports.
ENV SESSION_SECRET=build-time-placeholder-not-used
ENV COMP_API_URL=http://lobby:10999
RUN pnpm build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Runtime fs reads (catalog + schedule defaults); not always NFT-traced.
COPY --from=builder --chown=nextjs:nodejs /app/content/events ./content/events
COPY --chown=nextjs:nodejs server-entry.cjs ./server-entry.cjs
COPY --chmod=0755 docker-entrypoint.sh ./docker-entrypoint.sh

# Studio ingest writes PNGs here. Image copy is root-owned without --chown;
# bind mounts hide this dir, so the entrypoint also chmod's the mount.
RUN mkdir -p /app/public/armory/portraits \
  && chown -R nextjs:nodejs /app/public/armory \
  && chmod 0777 /app/public/armory/portraits

# Stay root for the entrypoint (chmod bind mounts), then drop to uid 1001.
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server-entry.cjs"]
