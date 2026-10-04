# Produto: planos, monetização e administração

## Planos (Free × Premium)

Definidos em [`packages/shared/src/plans.ts`](../packages/shared/src/plans.ts) e aplicados **no servidor**
(o app só reflete). Valores de preço **não** estão no código: a cobrança ainda não foi implementada.

| Recurso | Free | Premium |
|---|---|---|
| Contas | 2 | ilimitado |
| Cartões | 2 | ilimitado |
| Metas | 2 | ilimitado |
| Recorrências ativas | 10 | ilimitado |
| Gráficos | este mês e 3 meses | todos os períodos + personalizado |
| Insights avançados | — | sim |
| Open Finance | — | sim (se ligado no servidor) |

- `BILLING_ENFORCED=false` (padrão, **beta**): **todos** recebem os recursos Premium. Mude para `true` para
  os limites do Free valerem.
- O plano efetivo vem da tabela `subscriptions` (ausência de linha = Free; Premium só vale com status
  ativo/em teste e dentro do período). Estourar um limite responde `402 PLAN_LIMIT_REACHED` e o app mostra o convite ao Premium.
- **Não implementado:** compra/assinatura (Google Play Billing / App Store / gateway) e o webhook que escreve
  em `subscriptions`. A estrutura está pronta (`store`, `externalId`, `currentPeriodEnd`, `trialEndsAt`); falta
  escolher o provedor (ex.: RevenueCat — cotar) e implementar o webhook que atualiza a tabela. Regra das
  lojas: assinatura **dentro do app** deve usar o sistema de compra da loja.

## Administração (API)

Só metadados; **nunca** expõe senha, token, credencial bancária nem valores de lançamentos. Toda escrita é
auditada. Exige `role = 'ADMIN'` (ver como promover em [deploy.md](deploy.md#8-primeiro-administrador)).

| Endpoint | Para quê |
|---|---|
| `GET /v1/admin/users` | Lista usuários (busca por e-mail, filtro por status, paginação) |
| `GET /v1/admin/users/:id` | Detalhe: plano, status, contagens (contas, cartões, lançamentos, metas) e conexões bancárias (sem valores) |
| `PATCH /v1/admin/users/:id` | Suspender/reativar conta (não vale para você mesmo nem para outro admin) |
| `GET /v1/admin/stats` | Usuários (total, ativos, suspensos, premium, novos em 7/30 dias), cadastros por dia e conexões por status |
| `GET /v1/admin/integrations` | Estado de Auth, Open Finance (ligado/configurado, webhooks e erros em 24 h, códigos de erro mais comuns) e push |
| `GET /v1/admin/issues` | Problemas recentes: conexões bancárias com erro, webhooks que falharam e pedidos LGPD que falharam |

**Não implementado:** painel web (`apps/admin`). A API está pronta para um; hoje use o Swagger local
(`/openapi.json`) ou o SQL Editor do Supabase para consultas pontuais.
