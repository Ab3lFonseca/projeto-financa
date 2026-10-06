#!/bin/sh
# Entrada do contêiner da API: aplica as migrations pendentes do banco e só então sobe o servidor.
#
#  - O banco se atualiza sozinho a cada deploy: ninguém precisa lembrar de rodar `pnpm db:deploy`.
#  - Se uma migration falhar, o contêiner SAI com erro (a API nova não sobe com o banco pela metade). No Render, o deploy é dado como
#    falho e a versão anterior continua no ar.
#  - `prisma migrate deploy` é idempotente e usa trava no banco: instâncias subindo ao mesmo tempo não aplicam a mesma migration duas vezes.
#  - Desligue com MIGRATE_ON_START=false (ex.: se um dia as migrations passarem a rodar em outro lugar).
#  - Use a conexão por SESSÃO (Session pooler, porta 5432), nunca o pooler de transação (6543): migrations usam trava e prepared statements.
set -eu

if [ "${MIGRATE_ON_START:-true}" = "true" ]; then
  echo "[migrate] verificando migrations pendentes do banco..."
  cd /repo/packages/database
  # `timeout` evita travar o deploy se o banco não responder.
  timeout "${MIGRATE_TIMEOUT_SECONDS:-180}" /migrator/node_modules/.bin/prisma migrate deploy --config prisma.deploy.config.mjs
  echo "[migrate] banco em dia."
  cd /repo
else
  echo "[migrate] desligado (MIGRATE_ON_START=false): o banco precisa estar em dia por outro meio."
fi

exec node services/api/dist/server.js
