# API (Fastify + Prisma). Contexto de build = RAIZ do monorepo:
#   docker build -f services/api/Dockerfile -t financa-api .
#
# Estágio 1 compila (tsup embute @app/* e o compilador do Prisma num único server.js).
# Estágio 2 leva só o que roda: o bundle + as dependências de produção (fastify, jose, pg...).
# Migrations NÃO rodam aqui (a imagem não tem o CLI do Prisma): rodam no CI/na sua máquina (docs/deploy.md).

FROM node:24-slim AS build
WORKDIR /repo
RUN npm install -g pnpm@12.9.1

# Camada de dependências (só manifests): reaproveita cache enquanto o lockfile não muda.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/mobile/package.json apps/mobile/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/
COPY packages/dev-db/package.json packages/dev-db/
COPY services/api/package.json services/api/
RUN pnpm install --frozen-lockfile --filter "@app/api..."

COPY packages ./packages
COPY services/api ./services/api
# O client do Prisma é código gerado (não versionado). A URL é um placeholder: generate não conecta.
RUN pnpm --filter @app/database generate && pnpm --filter @app/api build
# Remove devDependencies (tsup, vitest, prisma CLI, embedded-postgres...) do node_modules.
RUN pnpm install --frozen-lockfile --prod --filter "@app/api..."

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo
# Mantém a estrutura do workspace: os symlinks do pnpm em services/api/node_modules apontam para cá.
COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/packages ./packages
COPY --from=build --chown=node:node /repo/services/api/node_modules ./services/api/node_modules
COPY --from=build --chown=node:node /repo/services/api/package.json ./services/api/package.json
COPY --from=build --chown=node:node /repo/services/api/dist ./services/api/dist
USER node
EXPOSE 3000
# O orquestrador (Fly) faz os health checks em /health e /ready; este é só para `docker run` local.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "services/api/dist/server.js"]
