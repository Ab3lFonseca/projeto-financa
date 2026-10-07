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
6. **Meios de pagamento:** *Settings → Payment methods*. Cartão vem ativo; Pix e boleto dependem da disponibilidade para a sua conta. **Ative o Pix aqui**
   (e confirme que ele vale para o seu domínio/conta): o app só deixa a pessoa escolher Pix quando o Stripe o oferece na página de pagamento. Veja a
   seção "Formas de pagar e Pix" abaixo: **Pix não funciona em assinatura comum**, por isso o app tem o "Pagar uma vez".
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

### Formas de pagar e Pix

A tela de assinatura oferece duas formas, com o mesmo preço lido do Stripe:

| Forma | O que é | Meios aceitos | Renova? |
|---|---|---|---|
| **Renova sozinha** | Assinatura (Checkout em modo `subscription`) | Cartão (Pix só com o Pix Automático, abaixo) | Sim, a cada ciclo, até cancelar |
| **Pagar uma vez** | Pagamento único por um período fechado (Checkout em modo `payment`): **30 dias** no mensal, **1 ano** no anual | **Pix e cartão** | Não: no fim o app volta a somente leitura e avisa; a pessoa paga de novo |

- **Por que o Pix não aparecia:** o Pix é um meio de pagamento **avulso**. O Stripe só o mostra em pagamentos únicos; em assinatura ele some, mesmo com o Pix
  habilitado no painel. Por isso o "Pagar uma vez" existe: é o caminho do Pix.
- **Como o acesso é liberado:** o servidor **nunca confia no corpo do aviso**. Ao receber `checkout.session.completed` ou
  `checkout.session.async_payment_succeeded` de um pagamento único, ele lê a sessão no Stripe e só libera se `payment_status` for `paid`. No cartão isso é
  imediato; no **Pix** o primeiro aviso chega com o pagamento ainda pendente (a pessoa ainda vai pagar o QR Code) e o `async_payment_succeeded` libera depois.
  Cada sessão concede o período **uma vez só**, mesmo que os dois avisos cheguem (idempotência em `billing_events`, marcador `prepaid:<sessão>`).
- **Pagar de novo antes de acabar soma** ao fim do prazo atual (não perde dias). Quem tem assinatura que renova sozinha não abre pagamento único (evita pagar
  em dobro) e quem pagou uma vez não tem "gerenciar assinatura" (não há assinatura). O adicional Rendimentos de um plano pago uma vez entra na hora de pagar de
  novo (não dá para ligar depois, porque não há item de assinatura para somar).
- **Receita mensal estimada do painel** não conta quem pagou uma vez (não é recorrente).
- **Pix recorrente (Pix Automático), opcional:** o Stripe suporta mandato de Pix em assinaturas a partir da versão de API `2026-04-22.dahlia`, e exige que o
  recurso esteja **habilitado na sua conta** e que a **versão da API da conta** (Workbench → versão da API) seja essa ou mais nova: o servidor não fixa
  versão, usa a da conta. Para tentar, defina `STRIPE_PIX_RECURRING=true` no Render: a assinatura **mensal** passa a enviar o mandato
  (teto de R$ 400, ou o dobro do valor, o que for maior; cobrança mensal). **O anual não envia nada de Pix**: o valor aceito para esse ciclo não foi confirmado
  e um valor errado faria o Stripe recusar a criação do pagamento. Se o Stripe recusar (conta sem o recurso), o pagamento da assinatura **não abre**: nesse caso
  desligue a variável. Ela vem **desligada** de propósito e **não foi testada com o Stripe real**.
- **Testar o Pix no modo de teste:** escolha "Pagar uma vez", na página do Stripe selecione Pix; no ambiente de teste o próprio Stripe oferece o botão para simular
  o pagamento. Se o Stripe pedir CPF, o de teste é `000.000.000-00`.

### Desconto por insígnias

Quem junta insígnias no nível Ouro ou acima ganha **5% de desconto a cada 5 insígnias, até 15%** (regras em [insignias.md](insignias.md#desconto-na-assinatura)).
Como funciona do lado do pagamento:

- **Cupons por degrau, criados sozinhos.** Na primeira vez que alguém precisa de um degrau, o servidor cria no Stripe o cupom `financa-badges-5`,
  `financa-badges-10` ou `financa-badges-15` (`percent_off` do degrau, `duration=forever`) e o reaproveita depois. Se já existir um cupom com esse id mas com
  **outro percentual** (ou inválido), o pagamento é **recusado** (`DISCOUNT_COUPON_MISMATCH`): nunca se cobra um desconto diferente do prometido. **Não edite nem
  apague esses cupons no painel.**
- **Permissão da chave restrita (`rk_`)**: além das listadas no passo 7, precisa de **escrita em Coupons** (criar o cupom). Com a chave completa (`sk_`) não há o
  que ajustar.
- **No pagamento**, o cupom entra em `discounts` da sessão do Checkout (assinatura e pagamento único). O Stripe **não aceita `discounts` junto de
  `allow_promotion_codes`**, então, quando há desconto de insígnias, o campo "código promocional" sai da página (o desconto das insígnias é o que vale; não se somam).
  O preço do plano continua o do Stripe; quem reduz é o cupom.
- **Quem já assina e ganha um degrau novo**: quando a pessoa lê as insígnias (ao abrir o app e depois de salvar algo), o servidor vê o degrau novo e troca o cupom da
  assinatura (`POST subscriptions/{id}` com `discounts`). Vale **nas próximas cobranças**; o que já foi cobrado não é devolvido. Só sobe, nunca desce. Se o Stripe falhar,
  a leitura das insígnias não quebra e a próxima leitura tenta de novo.
- **O servidor guarda o que está aplicado** em `subscriptions.discount_percent` (migration `20261009000200_discount_percent`, aditiva) e nos metadados do Stripe
  (`discount_percent`), que o webhook relê. O **painel do administrador** desconta esse percentual da receita mensal estimada.
- **Limites conhecidos:** o desconto vale sobre o **total** da assinatura (plano + adicional Rendimentos); no Pix recorrente e no pagamento único funciona do mesmo jeito. **Não foi
  exercitado com o Stripe real**, só com o de teste da suíte.

### Testar localmente

- **Sem Stripe:** `BILLING_PROVIDER=dev` assina na hora (preços fictícios), para testar teste → somente leitura → assinatura.
- **A página do Stripe abre numa aba separada** (na web) e o app continua aberto, esperando a confirmação e atualizando sozinho. Antes ela abria na mesma aba,
  o que enchia o histórico e fazia o "voltar" do navegador cair de novo na página de pagamento. Se o navegador bloquear a aba nova, o app cai no jeito
  antigo (troca a aba, sem deixar a página do app no histórico).
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
