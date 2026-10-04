# Open Finance (módulo trocável)

Conecta o banco do usuário pelo **Open Finance Brasil** (sistema regulado pelo Banco Central) para trazer,
sozinho, **contas, cartões, transações e investimentos**. O provedor é um módulo: hoje há um adaptador para o
**Pluggy**; trocar de provedor é escrever outro adaptador, sem mexer em rotas, banco ou telas.

> **Estado:** implementado e testado com provedores simulados (testes de integração, 41 testes do adaptador do
> Pluggy com `fetch` simulado e um **banco de demonstração** para ver o fluxo completo na tela, seção 9).
> **Nunca foi executado contra o Pluggy real** — não há credenciais. Antes de ligar em produção, faça o roteiro
> da seção 6 com a conta de teste do Pluggy. Está **desligado por padrão** (`OPEN_FINANCE_ENABLED=false`).

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
4. O app abre o **widget do Pluggy** com `connectorIds` = lista do passo 2: no celular, `react-native-pluggy-connect`
   (WebView); no navegador, `react-pluggy-connect` (modal com iframe). O usuário é levado ao app/site **do próprio banco**,
   autoriza e volta (celular: deep link `OPEN_FINANCE_REDIRECT_URI`; navegador: `OPEN_FINANCE_WEB_REDIRECT_URI`).
   **Nós nunca vemos senha.**
5. O widget devolve o `itemId`; o app chama `POST /v1/open-finance/connections`. A API confere no Pluggy que
   (a) o item pertence àquele usuário e (b) o conector é regulado; senão recusa (e remove o item no provedor).
6. O que acontece depois depende de `autoImport` (por conexão; **ligado por padrão**, o usuário escolhe na tela):

   **Importar tudo automaticamente (`autoImport = true`)**
   - Cada conta do banco vira uma **conta** do app e cada cartão vira um **cartão** (`source = OPEN_FINANCE`),
     respeitando os limites do plano. Cartão só é criado quando o banco informa fechamento e vencimento.
   - As transações **efetivadas** dos últimos 90 dias entram como lançamentos, sem revisão. Se o usuário já tinha
     lançado a mesma coisa à mão (mesmo valor/tipo, ±3 dias), o app **concilia** em vez de duplicar.
   - O saldo inicial da conta é ajustado para o saldo de hoje bater com o do banco.
   - Débito da conta corrente que paga a fatura ("PAGAMENTO FATURA", "PAG CARTAO"…) **quita a fatura** do cartão
     (como o "Pagar fatura" do app), da mais antiga para a mais nova, e não vira despesa. Sem fatura para quitar,
     vira despesa normal.
   - Limite, disponível, fatura atual, fechamento e vencimento do cartão, e o saldo da conta, são **os números do
     banco** (telas mostram "Dados do banco · atualizado há…"); o resto é calculado pelo app.
   - Investimentos entram na aba **Investir** (seção 2.1).

   **Modo manual (`autoImport = false`)**
   - O usuário **vincula** cada conta/cartão do banco a uma do app (`PUT .../accounts/:id`); só vinculadas
     sincronizam, e as transações ficam em `bank_transactions` com status `NEW`.
   - O usuário **revisa**: importa (vira lançamento), concilia ou ignora. Nada vira lançamento sozinho.

Atualizações chegam por **webhook** (`POST /v1/webhooks/pluggy`) e por um **job a cada 6 h** (conexões paradas
há mais de 24 h). No modo manual, pagamentos de fatura/estornos de **cartão** entram como `IGNORED`; estornos
(crédito) na conta do cartão são ignorados também no modo automático.

### 2.1 Investimentos (aba "Investir")

- O app lê `GET /investments` do provedor e guarda em `bank_investments`: nome, tipo/subtipo (CDB, LCI, LCA, fundo…),
  emissor, saldo, valor aplicado, rendimento (R$ e %), taxa ("110% do CDI", "CDI + 2% a.a.", "rentabilidade anual
  10,4%"), vencimento e quanto pode ser **resgatado agora**. Caixinhas, cofrinhos e porquinhos aparecem **como CDB**
  quando o banco os expõe assim (Nubank e PicPay, segundo o Pluggy); se o banco não os expõe, o app não inventa.
- **Evolução:** uma foto por dia por investimento (`bank_investment_snapshots`) alimenta o gráfico do detalhe, que
  começa no dia da conexão (o app não consegue reconstruir o passado).
- Um investimento só é marcado como encerrado quando a leitura vem **completa** (item não parcial) e **não vazia**;
  uma leitura parcial ou vazia por falha do banco não apaga nada.
- Somente leitura, também no banco de dados (RLS só permite `SELECT` para o app).

### 2.2 "Automático" significa diário, não em tempo real

Segundo a documentação do Pluggy (docs.pluggy.ai, consultada em 2026-10-04 — **confirme os números atuais**), o
Pluggy atualiza cada conexão **uma vez por dia** sozinho, e a rede do Open Finance limita as consultas por mês,
por produto, instituição e CPF (ex.: lista de investimentos 30/mês, saldo 120/mês, faturas e transações de cartão
30/mês, limites 240/mês). Por isso:

- o app se atualiza sozinho (webhook + job) e mostra "atualizado há…";
- **"Pedir ao banco"** força uma leitura nova, mas é limitado a **3 pedidos por dia**, com 30 min entre eles
  (contados em `audit_logs`), para não gastar a cota mensal do usuário;
- leituras simultâneas da mesma conexão (webhook + usuário) são **coalescidas** em uma só.

## 3. Segurança e privacidade

| Regra | Como é garantida |
|---|---|
| Nunca pedir/guardar senha de banco | Widget só lista conectores regulados (`connectorIds`); a API recusa e apaga itens não regulados |
| Conexão só do próprio usuário | `clientUserId` do item precisa ser o id do usuário; `(provider, provider_item_id)` é único |
| Webhook autêntico | Cabeçalho `x-webhook-secret` conferido **antes** de ler o corpo, em tempo constante; sem segredo configurado nada é aceito |
| Webhook não injeta dados | O payload é só gatilho; os dados vêm sempre da API do provedor (autenticada) |
| Reentrega de webhook | `webhook_events` com `UNIQUE(provider, event_id)`; repetido responde `duplicate: true` |
| Revogação | Retirar o consentimento, remover a conexão ou excluir a conta chama `DELETE /items/{id}` no Pluggy. Se falhar, a conexão fica `REVOKE_PENDING` e o job repete; **na exclusão de conta, nada é apagado até o provedor confirmar** |
| Minimização | 90 dias, só contas vinculadas, só efetivadas; ao revogar, apaga os investimentos, as fotos diárias e o que o usuário não aproveitou (`NEW`/`IGNORED`) |
| Permissões | O widget pede só `ACCOUNTS`, `CREDIT_CARDS`, `TRANSACTIONS` e `INVESTMENTS`, sempre leitura; o usuário vê a lista na tela de consentimento e pode ajustar/encerrar no app do banco |
| Logs | Sem corpo de requisição; erros do provedor viram códigos (`PROVIDER_*`), nunca texto com dados |
| Plano | Recurso Premium (`limits.openFinance`); com `BILLING_ENFORCED=false` (beta) todos têm |

## 4. Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `OPEN_FINANCE_ENABLED` | Liga o módulo (`true`/`false`) |
| `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` | Credenciais da sua conta Pluggy (**segredos**, só no servidor) |
| `PLUGGY_WEBHOOK_SECRET` | Segredo (>= 24 caracteres) que o Pluggy enviará no cabeçalho do webhook |
| `PLUGGY_BASE_URL` | Padrão `https://api.pluggy.ai` |
| `OPEN_FINANCE_REDIRECT_URI` | Deep link de retorno do **app nativo**, ex.: `financa://open-finance` (o esquema `financa` já está no app) |
| `OPEN_FINANCE_WEB_REDIRECT_URI` | Endereço de retorno do **app web**, ex.: `https://financa-web.onrender.com/open-finance` (local: `http://localhost:8081/open-finance`). O app informa a plataforma (`platform` em `POST /connect-token`) e a API escolhe qual usar |
| `PLUGGY_ALLOW_MEUPLUGGY` | `true` aceita também o conector gratuito **MeuPluggy** (id 200) para testar com a sua conta (seção 10). **Proibido em produção**: a API recusa subir |
| `OPEN_FINANCE_PROVIDER` | `pluggy` (padrão) ou `demo` (banco fictício; **só desenvolvimento**, a API recusa em produção) |

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
7. App web: já tem o widget (`react-pluggy-connect`); publicar no Render: [deploy-render.md](deploy-render.md). App nativo: gere um novo build.

## 6. Roteiro de validação com o Pluggy real (pendente)

Confira, com credenciais de teste, os pontos que a documentação não deixou 100% explícitos:

- [ ] `GET /items/{id}` devolve `clientUserId` (a API **recusa** a conexão se vier vazio).
- [ ] Valores de `status` do item (mapeados em `mapItemStatus`: `UPDATED`, `UPDATING`, `LOGIN_ERROR`, `OUTDATED`, `WAITING_USER_*`…).
- [ ] `GET /connectors` com `isOpenFinance=true&countries=BR&types=PERSONAL_BANK&page=` e o campo `totalPages`.
- [ ] Paginação `next` de `GET /v2/transactions` e sinal dos valores em cartão (mapeado conforme a doc "Transaction").
- [ ] Retorno do banco por deep link (`oauthRedirectUri`) em Android e iOS reais.
- [ ] `DELETE /items/{id}` realmente encerra o consentimento no banco (a documentação não afirma).
- [ ] Prazo/renovação do consentimento (`consentExpiresAt`).
- [ ] `GET /accounts` com `creditData` (limite, disponível, fechamento/vencimento da fatura, pagamento mínimo) e o
      sinal de `balance` em cartão.
- [ ] `GET /investments` (paginação, `type`/`subtype`, `rateType`, `fixedAnnualRate`/`annualRate`) e se **caixinhas,
      cofrinhos e porquinhos** do banco de teste aparecem (e como CDB). Cobertura do "Porquinho" do Inter: **não
      confirmada** na documentação.
- [ ] `PATCH /items/{id}` (atualização sob demanda) e o campo que indica leitura parcial do item.
- [ ] Débito de pagamento de fatura na conta corrente: descrição real que cada banco usa (a detecção é por
      "fatura"/"cartão" na descrição).

## 7. Endpoints (`/v1/open-finance`)

`GET /status` · `GET /connectors` · `POST /connect-token` · `POST /connections` · `GET /connections` ·
`PATCH /connections/:id` (`autoImport`) · `DELETE /connections/:id` · `POST /connections/:id/sync` ·
`POST /connections/:id/refresh` ("pedir ao banco") · `PUT /connections/:id/accounts/:providerAccountId` ·
`GET /overview` (números do banco por conta e cartão) · `GET /investments` · `GET /investments/:id` ·
`GET /bank-transactions` · `POST /bank-transactions/:id/{import|match|ignore|restore}` ·
`POST /v1/webhooks/pluggy` (sem login; segredo no cabeçalho).

## 8. Trocar de provedor

Implemente `OpenFinanceProvider` ([`provider.ts`](../services/api/src/modules/open-finance/provider.ts)):
normalizar valores para centavos positivos + `direction`, expor conectores regulados, itens/contas/transações,
`deleteItem` e `verifyWebhook`. Registre-o em `buildOpenFinanceProvider` (`app.ts`) e acrescente o valor ao enum
`OpenFinanceProvider` do Prisma. O banco, as rotas e o app não mudam.

## 9. Banco de demonstração (testar sem contratar o Pluggy)

Com `OPEN_FINANCE_ENABLED=true` e `OPEN_FINANCE_PROVIDER=demo` no `.env`, o botão **Conectar um banco** abre um aviso
("modo de desenvolvimento") em vez do widget e conecta o **Banco Demo**: conta corrente, cartão Gold (limite
R$ 8.000, fecha dia 10, vence dia 17) e 5 investimentos (CDB 110% do CDI, Caixinha Viagem, Meu Porquinho, LCI 94%
do CDI e Fundo DI). Tudo é calculado a partir do relógio, sem guardar estado: a cada dia entram transações novas,
os investimentos rendem e o pagamento da fatura (dia 17) tem o valor da fatura que fechou — o que dá para ver o
"automático" funcionando. Para recomeçar: `pnpm dev:seed -- --reset` e conecte de novo.

O modo demonstração não vale como validação do Pluggy: o que ele não prova está na seção 6.

## 10. Testar com a sua conta real, de graça (local)

Caminho sem contratar o Pluggy, só para você ver os **seus** dados no app. Dados de preços/limites do Pluggy consultados em 2026-10-04
em [pluggy.ai/pricing](https://www.pluggy.ai/pricing), [meu.pluggy.ai/api-guide](https://meu.pluggy.ai/api-guide) e
[pluggy.ai/meu-pluggy](https://www.pluggy.ai/meu-pluggy) — confirme antes de depender deles.

**O que é o MeuPluggy:** um portal gratuito onde **você** conecta os seus bancos pelo Open Finance (autorização no app do banco) e recebe
Client ID/Secret para consumir os seus dados pela API. Limites: **5 conexões ativas** e só contas do próprio titular; sem SLA.

1. Em [meu.pluggy.ai](https://meu.pluggy.ai) crie a conta e conecte o seu banco.
2. Em [dashboard.pluggy.ai](https://dashboard.pluggy.ai) crie a conta (mesmo e-mail), uma **aplicação**, e copie Client ID e Client Secret
   (aba *Application*). **Ative o conector "MeuPluggy"** na aplicação (passo que muita gente esquece).
3. No `.env` da raiz (ele não vai para o Git), no ambiente **local** (`NODE_ENV=development`):

   ```
   OPEN_FINANCE_ENABLED=true
   OPEN_FINANCE_PROVIDER=pluggy
   PLUGGY_ALLOW_MEUPLUGGY=true
   PLUGGY_CLIENT_ID=...
   PLUGGY_CLIENT_SECRET=...
   PLUGGY_WEBHOOK_SECRET=<qualquer texto aleatório com 24+ caracteres>
   OPEN_FINANCE_WEB_REDIRECT_URI=http://localhost:8081/open-finance
   ```
4. Suba tudo (`pnpm dev:db`, `pnpm dev:api` e o app web), entre no app e em **Mais → Open Finance → Conectar um banco**: o widget abre no
   navegador com o conector **MeuPluggy**; entre com a sua conta do MeuPluggy e autorize.
5. Webhook não chega em `localhost`: use **Atualizar** / **Pedir ao banco** (a atualização automática diária depende de o servidor estar de pé).

**Limites desta opção:** a API só aceita o conector 200 além dos regulados (qualquer outro por senha é recusado e removido); em produção
(Render com `NODE_ENV=production`) a variável é recusada, então o MeuPluggy fica restrito ao uso local.

> **Não validado com o Pluggy real:** o retorno do OAuth do MeuPluggy no widget web (popup × redirecionamento), os campos de cartão e
> investimentos que o MeuPluggy repassa e o `clientUserId` dos itens por esse conector. Confira o roteiro da seção 6 e me envie o que aparecer
> (sem segredos) para ajustarmos.