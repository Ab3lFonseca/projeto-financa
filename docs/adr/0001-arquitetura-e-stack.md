# ADR 0001 — Arquitetura, stack e infraestrutura

- **Status:** aprovada (2026-10-04)
- **Preços e planos verificados em 2026-10-04** nas fontes listadas ao final. Podem mudar: reverifique antes de contratar.

## Contexto

App de finanças pessoais, multiusuário, mobile (Android/iOS), dados financeiros sensíveis (LGPD),
com Open Finance no futuro. Começa com poucos usuários e orçamento mínimo, mas deve poder crescer
sem reescrita.

## Decisões

| # | Decisão | Motivo | Alternativas consideradas | Custo |
|---|---|---|---|---|
| 1 | **Expo + React Native + TypeScript** | Uma base de código para Android e iOS; builds e OTA via EAS; stack pedida | Flutter, nativo | EAS Free: 15 builds Android + 15 iOS. Starter US$ 19/mês |
| 2 | **Backend Node + Fastify + Zod + Prisma**, módulos por domínio | Leve (cabe em 512 MB), validação schema-first, OpenAPI gerado, pouca "mágica" | NestJS (mais estrutura/boilerplate); Supabase puro (lógica no banco/edge functions, ruim para webhooks, jobs e troca de provedor) | US$ 0 |
| 3 | **PostgreSQL no Supabase, região `sa-east-1` (São Paulo)** | Postgres padrão, sem lock-in; região no Brasil | Neon; Render PG (free expira em 30 dias) | Free: 500 MB, pausa após 1 semana sem uso, sem backup (**só desenvolvimento**). Pro: US$ 25/mês (8 GB, backup diário 7 dias, sem pausa) |
| 4 | **Auth: Supabase Auth** | Verificação de e-mail, reset de senha, refresh token e JWT prontos; **não armazenamos senhas**; Free até 50 mil MAU | Auth próprio (mais código e risco); Auth0/Clerk (preços não verificados) | Incluso. SMTP próprio em produção |
| 5 | **API no Fly.io, região `gru`** | Railway e Render não têm região em São Paulo; API e banco no Brasil evitam latência por query e transferência internacional de dados (LGPD art. 33) | Railway Hobby US$ 5/mês; Render Starter ~US$ 7/mês (ambos fora do Brasil; Render Free hiberna em 15 min) | Fly: sem free tier; shared-cpu-1x 512 MB ≈ US$ 3,69/mês (varia por região; confirmar `gru`) |
| 6 | **Jobs: pg-boss** (fila no próprio Postgres) | Recorrências, alertas e sync sem Redis | BullMQ + Redis; pg_cron | US$ 0 |
| 7 | **Sem Redis/cache de servidor no início** | TanStack Query no app + índices + paginação por cursor bastam | Redis | US$ 0 |
| 8 | **Open Finance como módulo (port/adapter); provedor inicial: Pluggy; fora do MVP** | Único com preço público, sandbox completo, SDK React Native e trial de 15 dias já em produção. Sem opção gratuita para produção multiusuário | Belvo (Launch US$ 1.000/mês; produto BR para instituições reguladas); Klavi e Iniciador (sem preço público); integração direta (inviável para app pequeno) | Pluggy Dados: a partir de R$ 2.500/mês. "Meu Pluggy": grátis, só uso pessoal (≤ 5 conexões) |
| 9 | **Monorepo pnpm** com Zod compartilhado entre API e app | Tipos e validação numa fonte só | Repositórios separados | US$ 0 |
| 10 | **Região e dados no Brasil** | Reduz complexidade de LGPD | — | — |

## Regras inegociáveis

- Nunca solicitar, transmitir ou armazenar senha/credencial bancária. Só conectores **regulados**
  (fluxo oficial de consentimento no banco) estarão habilitados.
- Segredos só em variáveis de ambiente do servidor; nada de secret no app mobile.
- Isolamento por usuário em camadas (API + FKs compostas + RLS) — ver `docs/database.md`.
- Planos gratuitos de infraestrutura **não** são usados para dados reais de usuários.

## Custo mensal estimado

| Fase | Itens | Custo |
|---|---|---|
| Desenvolvimento | Supabase Free, Expo Free, API local | US$ 0 |
| Beta com usuários reais | Supabase Pro US$ 25 + Fly ~US$ 4–8 + SMTP (free tier a verificar) | ≈ US$ 30–35/mês |
| Únicos/anuais | Google Play US$ 25 (única); Apple Developer US$ 99/ano (fonte de terceiros); domínio | |
| Com Open Finance | Pluggy Dados | + R$ 2.500/mês ou mais |

Ponto de equilíbrio ilustrativo do Open Finance: a R$ 14,90/mês de Premium, cobrir R$ 2.500 exige
~170 assinantes — antes de comissão das lojas, impostos e volume excedente.

## Fontes

- Pluggy: <https://www.pluggy.ai/pricing> · <https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use.md> · <https://docs.pluggy.ai/en/docs/get-started/contact.md> · <https://docs.pluggy.ai/docs/open-finance-regulated>
- Belvo: <https://belvo.com/plans-and-pricing/> · <https://belvo.com/blog/belvo-launches-official-open-finance-solution-regulated-institutions-brazil/>
- Supabase: <https://supabase.com/pricing> · <https://supabase.com/docs/guides/platform/regions>
- Fly.io: <https://docs.fly.io/about/pricing> · <https://docs.fly.io/reference/regions>
- Railway: <https://railway.com/pricing> · <https://docs.railway.com/reference/regions>
- Render: <https://render.com/docs/free> · <https://render.com/docs/regions>
- Expo EAS: <https://expo.dev/pricing>
- Prisma 7 (config e gerador): <https://www.prisma.io/docs/orm/reference/prisma-config-reference>
