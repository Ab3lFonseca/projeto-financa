# API (Fastify + Prisma). Contexto de build = RAIZ do monorepo:
#   docker build -f services/api/Dockerfile -t financa-api .
#
# Estágio 1 compila (tsup embute @app/* e o compilador do Prisma num único server.js).
# Estágio 2 instala só o CLI do Prisma, para aplicar as migrations pendentes quando o contêiner inicia (docker-entrypoint.sh).
# Estágio 3 leva só o que roda: o bundle + as dependências de produção (fastify, jose, pg...) + o CLI do passo anterior.
# O banco se atualiza sozinho a cada deploy (MIGRATE_ON_START, padrão ligado). A versão do `prisma` abaixo precisa ser a de
# packages/database/package.json (um teste confere).

FROM node:24-slim AS build
WORKDIR /repo
RUN npm install -g pnpm@12.9.1

# Camada de dependências (só manifests): reaproveita cache enquanto o lockfile não muda.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
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

FROM node:24-slim AS migrator
WORKDIR /migrator
# O motor de migrations do Prisma precisa do OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
# `--version` baixa o motor de migrations agora, no build, e não a cada início do contêiner.
RUN npm init -y > /dev/null \
 && npm install --no-audit --no-fund prisma@7.10.0 \
 && ./node_modules/.bin/prisma --version

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
# Mantém a estrutura do workspace: os symlinks do pnpm em services/api/node_modules apontam para cá.
COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/packages ./packages
COPY --from=build --chown=node:node /repo/services/api/node_modules ./services/api/node_modules
COPY --from=build --chown=node:node /repo/services/api/package.json ./services/api/package.json
COPY --from=build --chown=node:node /repo/services/api/dist ./services/api/dist
COPY --from=migrator --chown=node:node /migrator /migrator
COPY --chown=node:node services/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
USER node
EXPOSE 3000
# O orquestrador (Fly) faz os health checks em /health e /ready; este é só para `docker run` local.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["/usr/local/bin/docker-entrypoint.sh"]
