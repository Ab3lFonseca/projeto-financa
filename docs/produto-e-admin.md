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
- **Assinatura:** 30 dias de teste grátis (tudo liberado, inclusive o adicional Rendimentos) e depois mensalidade; sem assinar, o app fica **somente
  leitura**. Com `BILLING_ENFORCED=true` este é o modelo que vale (o "Free × Premium" da tabela acima passa a ser: teste/assinante = Premium, vencido =
  somente leitura). Pagamento pelo Stripe, cortesia para quem você quiser e administradores sempre liberados. Tudo em [assinatura.md](assinatura.md);
  preço, periodicidade e taxas em [monetizacao.md](monetizacao.md). Regra das lojas: assinatura vendida **dentro do app nativo** deve usar o sistema de
  compra da loja (a cobrança pelo site não tem essa exigência).

## Administração (API)

Só metadados de cadastro (nome, e-mail, plano, situação, datas e tema) e números agregados; **nunca** expõe senha, token, credencial bancária,
bancos conectados, contas, cartões, saldos nem lançamentos de ninguém. Toda escrita **e toda leitura de dados de usuários** é auditada (sem dados
pessoais na trilha). Exige `role = 'ADMIN'` (ver como promover, inclusive pela configuração `ADMIN_USER_IDS`, em [deploy.md](deploy.md#8-primeiro-administrador)).

| Endpoint | Para quê |
|---|---|
| `GET /v1/admin/users` | Lista usuários (nome, e-mail, plano, situação; busca por nome ou e-mail, filtro por status, paginação) |
| `GET /v1/admin/users/:id` | Detalhe: os mesmos dados da lista mais o tema escolhido (sem contagens, bancos conectados nem nada financeiro) |
| `PATCH /v1/admin/users/:id` | Suspender/reativar conta (não vale para você mesmo nem para outro admin) |
| `POST /v1/admin/users/:id/access` | Conceder acesso gratuito (cortesia): `{ days: 1-3650 \| null, investments }`. Recusa quem já tem assinatura paga ativa |
| `DELETE /v1/admin/users/:id/access` | Retirar a cortesia (só vale para cortesias) |
| `GET /v1/admin/stats` | Usuários (total, ativos, suspensos, premium, novos em 7/30 dias, quem concluiu o tutorial), cadastros por dia, temas em uso, assinaturas (teste, pagantes, cortesias, vencidos, adicional, receita mensal estimada) e conexões por status (só números) |
| `GET /v1/admin/integrations` | Estado de Auth, Open Finance (ligado/configurado, webhooks e erros em 24 h, códigos de erro mais comuns) e push |
| `GET /v1/admin/issues` | Problemas recentes: conexões bancárias com erro (só o código, nunca o banco), webhooks que falharam e pedidos LGPD que falharam |

**Painel no app:** quem é administrador vê, em *Mais*, o *Painel do administrador* (números do app, cadastros dos últimos 30 dias,
temas escolhidos, estado do login/Open Finance/avisos e a lista de usuários com detalhe) e o *Diagnóstico* (erros e respostas da API). As telas
voltam ao início para quem não é administrador e a API responde 403.
