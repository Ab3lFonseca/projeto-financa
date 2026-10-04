# Open Finance (módulo trocável)

Conecta o banco do usuário pelo **Open Finance Brasil** (sistema regulado pelo Banco Central) para trazer
contas e transações. O provedor é um módulo: hoje há um adaptador para o **Pluggy**; trocar de provedor
é escrever outro adaptador, sem mexer em rotas, banco ou telas.

> **Estado:** implementado e testado com um provedor simulado (29 testes de integração + 29 do
> adaptador com `fetch` simulado). **Nunca foi executado contra o Pluggy real** — não há credenciais.
> Antes de ligar em produção, faça o roteiro da seção 6 com a conta de teste do Pluggy.
> Está **desligado por padrão** (`OPEN_FINANCE_ENABLED=false`).

## 1. Custo e contrato (leia antes de ligar)

Consultado em 2026-10-04 em [pluggy.ai/pricing](https://www.pluggy.ai/pricing): teste grátis de **15 dias**
em produção; depois, o plano **Dados** parte de **R$ 2.500/mês** (inclui Open Finance), com cobrança por
requisição acima do volume incluso. O conector gratuito "Meu Pluggy" tem limite de 5 conexões ativas.
Confirme condições e se há aprovação adicional para os conectores regulados com o comercial do Pluggy.

**Decisão: lançar sem Open Finance** e ligá-lo quando houver receita (plano Premium) que cubra o custo.
Alternativas: outro agregador (Belvo, Quanto — cotar), ou o caminho gratuito de **importar extrato
CSV/OFX** (não implementado; seria um novo "provedor" que alimenta a mesma tabela `bank_transactions`).

## 2. Como funciona (fluxo)

1. O usuário aceita o **consentimento específico** de Open Finance (tela do app). Fica registrado em `consents`.
2. O app pede `GET /v1/open-finance/connectors`: a API devolve **só os bancos do Open Finance regulado**
   (filtro `isOpenFinance=true`, pessoa física, Brasil). Se a lista não carregar, o app **não abre o widget**.
3. O app pede `POST /v1/open-finance/connect-token`: a API gera um token de 30 min **amarrado ao usuário**
   (`clientUserId`) e com o deep link de retorno (`oauthRedirectUri`).
4. O app abre o **widget do Pluggy** (`react-native-pluggy-connect`) com `connectorIds` = lista do passo 2. O
   usuário é levado ao app/site **do próprio banco**, autoriza e volta. **Nós nunca vemos senha.**
5. O widget devolve o `itemId`; o app chama `POST /v1/open-finance/connections`. A API confere no Pluggy que
   (a) o item pertence àquele usuário e (b) o conector é regulado; senão recusa (e remove o item no provedor).
6. O usuário **vincula** cada conta/cartão do banco a uma conta/cartão do app (`PUT .../accounts/:id`).
   Só contas vinculadas são sincronizadas.
7. A sincronização busca os **últimos 90 dias** na primeira vez e, depois, desde a última (com 7 dias de folga).
   Entram só transações **efetivadas**; ficam em `bank_transactions` com status `NEW`.
8. O usuário **revisa**: importa (vira lançamento), concilia com um lançamento manual parecido (mesmo valor/tipo,
   ±3 dias) ou ignora. Nada vira lançamento sozinho.

Atualizações chegam por **webhook** (`POST /v1/webhooks/pluggy`) e por um **job a cada 6 h** (conexões paradas
há mais de 24 h). Pagamentos de fatura/estornos de **cartão** entram como `IGNORED` (a fatura já é paga pela conta).

## 3. Segurança e privacidade

| Regra | Como é garantida |
|---|---|
| Nunca pedir/guardar senha de banco | Widget só lista conectores regulados (`connectorIds`); a API recusa e apaga itens não regulados |
| Conexão só do próprio usuário | `clientUserId` do item precisa ser o id do usuário; `(provider, provider_item_id)` é único |
| Webhook autêntico | Cabeçalho `x-webhook-secret` conferido **antes** de ler o corpo, em tempo constante; sem segredo configurado nada é aceito |
| Webhook não injeta dados | O payload é só gatilho; os dados vêm sempre da API do provedor (autenticada) |
| Reentrega de webhook | `webhook_events` com `UNIQUE(provider, event_id)`; repetido responde `duplicate: true` |
| Revogação | Retirar o consentimento, remover a conexão ou excluir a conta chama `DELETE /items/{id}` no Pluggy. Se falhar, a conexão fica `REVOKE_PENDING` e o job repete; **na exclusão de conta, nada é apagado até o provedor confirmar** |
| Minimização | 90 dias, só contas vinculadas, só efetivadas; ao revogar, apaga o que o usuário não aproveitou (`NEW`/`IGNORED`) |
| Logs | Sem corpo de requisição; erros do provedor viram códigos (`PROVIDER_*`), nunca texto com dados |
| Plano | Recurso Premium (`limits.openFinance`); com `BILLING_ENFORCED=false` (beta) todos têm |

## 4. Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `OPEN_FINANCE_ENABLED` | Liga o módulo (`true`/`false`) |
| `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` | Credenciais da sua conta Pluggy (**segredos**, só no servidor) |
| `PLUGGY_WEBHOOK_SECRET` | Segredo (>= 24 caracteres) que o Pluggy enviará no cabeçalho do webhook |
| `PLUGGY_BASE_URL` | Padrão `https://api.pluggy.ai` |
| `OPEN_FINANCE_REDIRECT_URI` | Deep link de retorno, ex.: `financa://open-finance` (o esquema `financa` já está no app) |

Em produção, com a flag ligada, a API **recusa subir** sem `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` e `PLUGGY_WEBHOOK_SECRET`.

## 5. Ligar (passo a passo)

1. Crie a conta no Pluggy e anote **Client ID/Secret** (painel → aplicações).
2. No painel, em **Connect widget → conectores**, mantenha só os de pessoa física que quiser oferecer.
3. Gere o segredo do webhook: `openssl rand -hex 32`.
4. Segredos no Fly: `fly secrets set PLUGGY_CLIENT_ID=... PLUGGY_CLIENT_SECRET=... PLUGGY_WEBHOOK_SECRET=... OPEN_FINANCE_REDIRECT_URI=financa://open-finance`.
5. Cadastre o webhook (uma vez), com as mesmas variáveis no seu `.env` local:

   ```bash
   pnpm --filter @app/api pluggy:webhook -- https://api.seudominio.com.br/v1/webhooks/pluggy
   ```
   (O Pluggy exige HTTPS e domínio público; ele passará a enviar `x-webhook-secret` em toda chamada.)
6. Em `fly.toml` mude `OPEN_FINANCE_ENABLED = "true"` e faça `fly deploy`.
7. Gere um novo build do app (o widget só existe no app nativo; na web aparece um aviso).

## 6. Roteiro de validação com o Pluggy real (pendente)

Confira, com credenciais de teste, os pontos que a documentação não deixou 100% explícitos:

- [ ] `GET /items/{id}` devolve `clientUserId` (a API **recusa** a conexão se vier vazio).
- [ ] Valores de `status` do item (mapeados em `mapItemStatus`: `UPDATED`, `UPDATING`, `LOGIN_ERROR`, `OUTDATED`, `WAITING_USER_*`…).
- [ ] `GET /connectors` com `isOpenFinance=true&countries=BR&types=PERSONAL_BANK&page=` e o campo `totalPages`.
- [ ] Paginação `next` de `GET /v2/transactions` e sinal dos valores em cartão (mapeado conforme a doc "Transaction").
- [ ] Retorno do banco por deep link (`oauthRedirectUri`) em Android e iOS reais.
- [ ] `DELETE /items/{id}` realmente encerra o consentimento no banco (a documentação não afirma).
- [ ] Prazo/renovação do consentimento (`consentExpiresAt`).

## 7. Endpoints (`/v1/open-finance`)

`GET /status` · `GET /connectors` · `POST /connect-token` · `POST /connections` · `GET /connections` ·
`DELETE /connections/:id` · `POST /connections/:id/sync` · `PUT /connections/:id/accounts/:providerAccountId` ·
`GET /bank-transactions` · `POST /bank-transactions/:id/{import|match|ignore|restore}` ·
`POST /v1/webhooks/pluggy` (sem login; segredo no cabeçalho).

## 8. Trocar de provedor

Implemente `OpenFinanceProvider` ([`provider.ts`](../services/api/src/modules/open-finance/provider.ts)):
normalizar valores para centavos positivos + `direction`, expor conectores regulados, itens/contas/transações,
`deleteItem` e `verifyWebhook`. Registre-o em `buildOpenFinanceProvider` (`app.ts`) e acrescente o valor ao enum
`OpenFinanceProvider` do Prisma. O banco, as rotas e o app não mudam.
