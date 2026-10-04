# Finança — app de finanças pessoais

App Android/iOS (Expo + React Native) com API própria (Fastify + Prisma + Postgres), multiusuário com dados
isolados, LGPD e Open Finance Brasil como módulo opcional.

## Estrutura

```
apps/mobile/        App Expo (React Native + TypeScript, expo-router)
services/api/       API REST (Fastify 5, Zod 4, Prisma 7), jobs em processo, testes de integração
packages/database/  Schema Prisma, migrations (constraints + RLS), seed, testes (PGlite)
packages/shared/    Schemas Zod, enums e regras de negócio compartilhadas (dinheiro, faturas, recorrência)
packages/dev-db/    Postgres 18 embutido para desenvolvimento e testes (sem Docker)
docs/               Decisões, banco, deploy, Open Finance, LGPD, produto/admin
scripts/dev/        Scripts PowerShell para subir banco, API e app na web
```

## Documentação

- [Deploy completo (banco, API, domínio, lojas) e custos](docs/deploy.md)
- [Open Finance](docs/open-finance.md) · [LGPD](docs/lgpd.md) · [Planos e administração](docs/produto-e-admin.md)
- [Logs e diagnóstico — como investigar um erro](docs/logs.md) · [Changelog](CHANGELOG.md)
- [Banco de dados — modelo e decisões](docs/database.md)
- [ADR 0001 — Arquitetura e stack](docs/adr/0001-arquitetura-e-stack.md)

## Pré-requisitos

Node.js 24 e pnpm 12 (`npm i -g pnpm`). **Não precisa de Docker nem de conta em nuvem** para rodar tudo localmente:
o Postgres de desenvolvimento é embutido e o login usa um modo de desenvolvimento (`AUTH_MODE=dev`).

## Como rodar e testar

```bash
pnpm install
cp .env.example .env        # já vem pronto para desenvolvimento local
```

Em **três terminais** (deixe abertos):

```bash
pnpm dev:db        # Postgres local (porta 54329); aplica as migrations sozinho
pnpm dev:seed      # (uma vez) cria o usuário demo com 6 meses de dados
pnpm dev:api       # API em http://localhost:3000
```
```bash
cd apps/mobile && npx expo start --web     # app em http://localhost:8081 (use o modo celular do navegador)
```

Login de demonstração: `demo@financa.dev` / `Demo@12345678`.

**No celular real:** instale o *Expo Go*, rode `npx expo start` em `apps/mobile` e defina
`EXPO_PUBLIC_API_URL=http://IP-DO-SEU-PC:3000` (o `localhost` do celular não é o seu computador).
Biometria, push, exportar arquivo e o widget do Open Finance só funcionam no app nativo.

Os logs ficam em `.data/logs` (`errors-AAAA-MM-DD.log` é o primeiro a abrir quando algo falhar); no app, veja
*Mais → Configurações → Diagnóstico*. Detalhes em [docs/logs.md](docs/logs.md).

Testes e verificações:

```bash
pnpm test           # banco (PGlite) + shared + API (integração com Postgres real) + app
pnpm typecheck      # todos os pacotes
```

## Progresso

| Etapa | Status |
|---|---|
| 1. Arquitetura, stack e Open Finance | ✅ ADR + comparativo |
| 2. Banco de dados | ✅ migrations aplicadas em Postgres 18 real e PGlite; constraints, RLS e exclusão LGPD testadas |
| 3. Backend e autenticação | ✅ 20+ módulos; Supabase Auth + modo dev; jobs; **testes de integração passando** |
| 4. Mobile: base, auth, navegação, tema | ✅ |
| 5. Lançamentos, contas, cartões, faturas, parcelas | ✅ |
| 6. Dashboard, insights e gráficos (6 tipos, períodos) | ✅ |
| 7. Orçamentos, metas, recorrências, categorias | ✅ |
| 8. Notificações, offline com sincronização | ✅ |
| 9. LGPD (consentimento, exportar, excluir) e configurações | ✅ |
| 10. Open Finance (Pluggy) | 🟡 contas, cartões (limite/fatura do banco), transações e **investimentos** puxados sozinhos, atualização diária, aba **Investir**; backend e telas prontos, testados com provedor **simulado** e um **banco de demonstração** (`OPEN_FINANCE_PROVIDER=demo`); falta validar com o Pluggy real ([roteiro](docs/open-finance.md#6-roteiro-de-validação-com-o-pluggy-real-pendente)) |
| 11. Testes e endurecimento | ✅ API e shared cobertos; telas do app **não têm testes automatizados** |
| 12. Deploy | 🟡 Dockerfile, `fly.toml`, CI/CD e `eas.json` escritos; bundle de produção validado localmente; **imagem Docker e builds EAS ainda não executados** |

## Desvios do plano original (decididos e justificados)

- **Abas:** Início, Transações, Gráficos, Carteira (contas + cartões), Investir (Open Finance) e Mais.
- **Jobs em processo** (com *advisory locks* do Postgres) no lugar de `pg-boss`: sem dependência extra, seguro com várias instâncias.
- **Login de desenvolvimento** (`AUTH_MODE=dev`) para trabalhar sem internet; é **proibido em produção** (a API recusa subir).
- **Sem Docker no desenvolvimento:** Postgres embutido (`embedded-postgres`) para dev e testes.

## Pendências conhecidas

- Tela de **redefinição de senha** no app (o e-mail de recuperação funciona, mas falta a tela que recebe o link).
- Testes automatizados das **telas** do app e verificação visual completa em aparelho real (iOS/Android).
- **Cobrança do Premium** (compra na loja + webhook que preenche `subscriptions`) e **painel admin web**.
- Importação de extrato **CSV/OFX** (alternativa gratuita ao Open Finance).
- Revisão jurídica dos textos, dados da empresa, ícones definitivos e `APP_ID` próprio antes de publicar.
- Validar o Open Finance com credenciais reais do Pluggy; rodar o primeiro build Docker/EAS.
