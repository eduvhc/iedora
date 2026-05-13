# syntax=docker/dockerfile:1.7
# Multi-stage build para Next.js 16 em produção.
# Bun instala dependências (rápido); Node executa o build (AGENTS.md: Bun + next build
# é instável); imagem final usa Node sobre o output `standalone` do Next.

# ── Stage 1: dependências ─────────────────────────────────────────────────────
FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN node --run build

# ── Stage 3: runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nextjs && \
    adduser -S -u 1001 -G nextjs nextjs

# Standalone output inclui server.js + dependências mínimas
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
