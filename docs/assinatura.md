# Assinatura: teste grátis, cobrança e acesso gratuito

O app tem **30 dias de teste grátis** e, depois, cobra uma **mensalidade**. Acabou o teste e a pessoa não assinou? O app vira **somente leitura**:
ela continua vendo tudo e pode **exportar** os dados, mas não cria nem edita nada até assinar. Nada é apagado. Contas de administrador e contas com
**cortesia** nunca são limitadas.

O pagamento acontece **na página do Stripe** (cartão, e outros meios que a sua conta Stripe habilitar). Dados de cartão **nunca** passam pelo nosso
servidor nem ficam no nosso banco.

> **Estado atual:** o servidor (API) está pronto e testado. A cobrança vem **desligada** (`BILLING_ENFORCED=false`, o "beta"): nada muda para ninguém até
> você ligar. As telas de assinatura no app (assinar, gerenciar, aviso de fim do teste) vêm na sequência; até lá não ligue a cobrança.

## 1. Como a pessoa acessa o app

| Estado | Quando | Pode criar/editar? | Rendimentos* |
|---|---|---|---|
| `beta` | `BILLING_ENFORCED=false` | sim | sim |
| `trial` | até `TRIAL_DAYS` (30) depois do cadastro | sim | **sim** (incluso no teste) |
| `paid` | assinatura em dia | sim | só se contratou o adicional |
| `complimentary` | cortesia concedida por um administrador | sim | só se o administrador incluiu |
| `admin` | conta `ADMIN` | sim | sim |
| `expired` | teste acabou e não há assinatura | **não** (somente leitura) | não |

\* O adicional "Rendimentos" (painel de CDI/CDB, porquinho e investimentos) é um plano a mais, ainda **em construção**; ver [produto-e-admin.md](produto-e-admin.md).

Regras que valem sempre:

- **Cartão recusado não derruba ninguém no meio do mês:** assinatura `PAST_DUE` mantém o acesso até o fim do período já pago.
- **Cancelar mantém o acesso até o fim do período pago** (`cancelAtPeriodEnd`).
- **Contas antigas:** com `BILLING_STARTS_AT=AAAA-MM-DD`, quem se cadastrou antes dessa data começa o teste nela. Sem isso, todas as contas existentes
  nasceriam com o teste já vencido no dia em que você ligar a cobrança.
- Somente leitura = qualquer `POST/PUT/PATCH/DELETE` de dados responde **402 `SUBSCRIPTION_REQUIRED`**; `GET`, exportação e a parte de assinatura
  e notificações continuam funcionando. O app deve mostrar o convite a assinar a partir desse código.
- O Rendimentos fora do plano responde **402 `FEATURE_NOT_INCLUDED`**.

## 2. Fluxo de pagamento

```
App ──POST /v1/billing/checkout──▶ API ──cria sessão──▶ Stripe
App ◀── { url } ───────────────────┘
App ──abre a página do Stripe──▶ pessoa paga
Stripe ──POST /v1/webhooks/stripe (assinado)──▶ API ──relê a assinatura no Stripe──▶ grava em `subscriptions`
App ──GET /v1/billing (ao voltar)──▶ { access: paid }
```

| Endpoint | Para quê |
|---|---|
| `GET /v1/billing` | Estado: acesso, preços lidos do Stripe, se dá para assinar/gerenciar, se tem o adicional |
| `POST /v1/billing/checkout` `{ investments? }` | Abre o pagamento; devolve a `url` do Stripe. 409 se já tem acesso ou a cobrança está desligada |
| `POST /v1/billing/portal` | Portal do Stripe: trocar cartão, ver faturas, cancelar |
| `POST /v1/billing/addon` `{ enabled }` | Liga/desliga o Rendimentos numa assinatura paga (cobra proporcional) |
| `POST /v1/webhooks/stripe` | Webhook do Stripe (sem login; protegido pela assinatura) |
| `POST/DELETE /v1/admin/users/:id/access` | Cortesia (administrador): `{ days \| null, investments }` / retirar |

Segurança do desenho:

- **Webhook:** confere a assinatura HMAC-SHA256 sobre os **bytes exatos** do corpo, recusa pedidos com mais de 5 minutos (reenvio de pedido capturado) e
  aceita mais de uma assinatura (troca de segredo no Stripe). Sem assinatura válida: 401 e nada é gravado.
- **Idempotente e à prova de ordem:** cada evento é registrado em `billing_events` (id único); repetido é ignorado. O servidor **relê a assinatura no
  Stripe** em vez de confiar no corpo do evento, então eventos atrasados ou fora de ordem não estragam o estado. Se o processamento falhar, o registro do
  evento é desfeito e o Stripe reenvia (e o reenvio funciona).
- **Preço nunca no código:** os valores são lidos do Stripe (cache de 10 min). Mudar o preço é no painel do Stripe.
- **Endereços de retorno** vêm da configuração (`APP_WEB_URL`), nunca do cliente (sem redirecionamento aberto).
- **Erros do Stripe** viram um código estável; o texto livre do provedor (que pode citar cartão) não vai para o app nem para o log.
- `BILLING_PROVIDER=dev` (assina sem pagar) é **proibido em produção**; `BILLING_ENFORCED=true` em produção exige um provedor.

## 3. Configurar o Stripe (uma vez)

1. Crie a conta no Stripe (Brasil) e trabalhe primeiro no **modo de teste**.
2. **Catálogo de produtos (mensal e anual):** crie um produto para cada ciclo, cada um com **um preço recorrente em BRL** definido como **preço padrão**
   (é o que o painel faz ao criar o produto com preço). Copie o id de cada **produto** (`prod_...`) → `STRIPE_PRODUCT_ID_MONTHLY` e
   `STRIPE_PRODUCT_ID_YEARLY`. **O servidor descobre sozinho o preço ativo de cada produto**: você não precisa copiar `price_...`. Se preferir fixar um
   preço específico, use `STRIPE_PRICE_ID_MONTHLY` / `STRIPE_PRICE_ID_YEARLY` (o `price_` vale mais que o `prod_` do mesmo ciclo). Dá para vender só
   um ciclo. A tela mostra o **anual primeiro**, com a economia **calculada** dos dois preços (nunca escrita à mão). Mudar o preço é criar um preço
   novo no Stripe e torná-lo o padrão do produto; o app o lê em até 10 minutos. Produto com mais de um preço e **sem preço padrão** é ignorado (o
   servidor não adivinha qual cobrar) e o motivo fica no log da API.
3. (Opcional) Adicional "Rendimentos": um produto por ciclo, no mesmo formato → `STRIPE_PRODUCT_ID_INVESTMENTS_MONTHLY` e `..._YEARLY`. O Stripe exige o
   **mesmo ciclo em todos os itens** de uma assinatura, então quem assina o anual contrata o adicional anual. Sem o adicional num ciclo, ele não é
   oferecido nesse ciclo.
4. **Webhook:** *Developers → Webhooks → Add endpoint* com `https://SUA-API.onrender.com/v1/webhooks/stripe` e os eventos
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. Copie o **segredo de assinatura** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`.
5. **Portal do cliente:** *Settings → Billing → Customer portal*: permita atualizar forma de pagamento, ver faturas e **cancelar assinatura**.
6. **Meios de pagamento:** *Settings → Payment methods*. Cartão vem ativo; Pix e boleto dependem da disponibilidade para a sua conta.
7. **Chave secreta:** *Developers → API keys* → `STRIPE_SECRET_KEY` (começa com `sk_`; uma chave **restrita** `rk_` também serve). **Nunca** a publicável (`pk_`):
   a API recusa subir com ela. **A chave publicável não é usada em lugar nenhum** (o pagamento é a página hospedada do Stripe; nada de cartão passa pelo
   app). **Nunca** cole chaves em conversa, e-mail ou no repositório: só no painel do Render. Se uma chave já foi exposta, role-a no Stripe.
   Uma chave restrita `rk_` precisa de permissão (escrita) em: Checkout Sessions, Customer portal, Customers, Subscriptions e Subscription items; e
   (leitura) em Products e Prices.
8. No Render (**financa-api → Environment**): `BILLING_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRODUCT_ID_MONTHLY`,
   `STRIPE_PRODUCT_ID_YEARLY`, `STRIPE_PRODUCT_ID_INVESTMENTS_MONTHLY/YEARLY` (se houver) e `APP_WEB_URL` (endereço do **site**, ex.:
   `https://financa-web.onrender.com`). O deploy aplica sozinho as migrations `20261006000100_billing` (colunas novas em `subscriptions` e a tabela
   `billing_events`) e `20261008000100_billing_interval` (guarda se a assinatura é mensal ou anual).

Conferir: com as variáveis certas a API sobe; com alguma faltando ela **recusa subir** e diz qual. Com o provedor ligado (ainda com
`BILLING_ENFORCED=false`), `GET /v1/billing` já devolve os preços lidos do Stripe, o que confirma que a chave e os `price_` estão certos.

### Testar localmente

- **Sem Stripe:** `BILLING_PROVIDER=dev` assina na hora (preços fictícios), para testar teste → somente leitura → assinatura.
- **Com Stripe em modo de teste:** [Stripe CLI](https://docs.stripe.com/stripe-cli) com `stripe listen --forward-to localhost:3000/v1/webhooks/stripe`
  (ele imprime o `whsec_` daquela sessão) e o cartão de teste `4242 4242 4242 4242` com qualquer validade futura e CVC.

## 4. Acesso gratuito (cortesia)

Para a sua conta, familiares, parceiros ou quem você quiser **sem pagar**:

- **Administrador** (`ADMIN_USER_IDS`): sempre liberado, com tudo, sem prazo.
- **Cortesia:** `POST /v1/admin/users/:id/access` com `{ "days": 90, "investments": false }` (ou `"days": null` para sem prazo; `"investments": true` inclui o
  Rendimentos). `DELETE` na mesma rota retira. Fica na auditoria (`admin.access.granted/revoked`). Recusa quem já tem **assinatura paga ativa**
  (para não apagar o vínculo com o Stripe; essa pessoa cancela no portal) e só retira o que é cortesia.
- O painel do administrador mostra o acesso de cada pessoa e os números (teste, pagantes, cortesias, vencidos, adicional e a receita mensal estimada).
  Sem nenhum dado do pagamento.

## 5. Antes de ligar a cobrança (checklist)

- [ ] Fluxo completo no **modo de teste** do Stripe: assinar, ver o acesso mudar, cancelar, recusar cartão (`4000 0000 0000 0341` simula recusa na renovação), reenviar o webhook pelo painel.
- [ ] Chaves **live** no Render (`sk_live_...`, `whsec_` do endpoint live, `price_` do modo live) e um pagamento real pequeno **com reembolso**.
- [ ] *Developers → Webhooks* mostrando respostas **200** do seu endpoint.
- [ ] `BILLING_STARTS_AT` definido (data de início) e `TRIAL_DAYS` conferido; só então `BILLING_ENFORCED=true`.
- [ ] **Termos e Política de Privacidade** atualizados: o Stripe é operador do pagamento, os dados de pagamento ficam com ele, regras de cancelamento e
      reembolso (direito de arrependimento do CDC, art. 49, quando aplicável). Revise com um(a) advogado(a). Versione os textos (`LEGAL_*_VERSION`).
- [ ] Tela de assinatura e aviso de fim de teste publicados no app (próxima etapa).
- [ ] Contador/contabilidade: emissão de nota fiscal e enquadramento fiscal da receita recorrente.
- [ ] **Lojas de aplicativos:** assinatura vendida **dentro do app** nativo (Google Play/App Store) costuma exigir o sistema de compra da loja. A cobrança
      pelo site (como aqui) vale para a versão web; para os apps nas lojas, confirme as regras vigentes antes de publicar.
