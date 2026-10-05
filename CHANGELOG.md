# Changelog

Todas as mudanças relevantes do projeto ficam aqui. O formato segue o
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

> **Como manter:** toda mudança que o usuário (ou quem opera o app) perceba entra em **[Não lançado]**, na
> categoria certa (Adicionado, Alterado, Corrigido, Segurança, Removido). Ao publicar uma versão, renomeie a seção
> para o número e a data e abra uma nova **[Não lançado]** vazia. Mudanças só internas (refatorações, testes) não precisam entrar.

## [Não lançado]

### Adicionado
- **Open Finance puxa tudo sozinho.** Ao conectar um banco (opção "Importar tudo automaticamente", ligada por padrão),
  o app cria a conta e o cartão, importa as transações dos últimos 90 dias, ajusta o saldo inicial para bater com o
  do banco e passa a se atualizar uma vez ao dia, sem você revisar nada. Desligando a opção, volta o modo manual
  (você escolhe a conta e revisa cada transação). Veja [docs/open-finance.md](docs/open-finance.md).
- **Cartões com os números do banco:** limite, limite disponível, fatura atual, fechamento e vencimento vêm do
  Open Finance (Carteira e detalhe do cartão, com "Dados do banco · atualizado há…"). Quando a conta que paga a
  fatura debita o pagamento, o app quita a fatura correspondente em vez de lançar uma despesa nova.
- **Aba "Investir":** CDB, caixinhas, cofrinhos, porquinhos, LCI/LCA e fundos, com saldo, valor aplicado, rendimento
  (R$ e %), taxa ("110% do CDI"), vencimento, quanto pode resgatar agora e a evolução diária (o app guarda uma foto
  por dia). Somente leitura: o app nunca aplica nem resgata.
- **"Pedir ao banco" (atualizar agora):** força uma nova leitura, com limite de 3 pedidos por dia e 30 min entre eles,
  porque o Open Finance limita as consultas por mês e instituição.
- **Banco de demonstração** (`OPEN_FINANCE_PROVIDER=demo`, só em desenvolvimento; a API recusa subir assim em
  produção): conta corrente, cartão e 5 investimentos que rendem com o passar dos dias, para testar o fluxo inteiro
  sem contratar o Pluggy. `pnpm dev:seed -- --reset` recria a conta de demonstração.
- **Widget do Open Finance no navegador** (`react-pluggy-connect`): dá para conectar o banco pelo app web, sem build
  nativo. A API escolhe o endereço de retorno certo (`OPEN_FINANCE_WEB_REDIRECT_URI` para a web, `OPEN_FINANCE_REDIRECT_URI`
  para o celular) conforme o `platform` enviado em `POST /v1/open-finance/connect-token`.
- **MeuPluggy (teste gratuito com a sua conta):** `PLUGGY_ALLOW_MEUPLUGGY=true` aceita também o conector gratuito do Pluggy
  (id 200), e só ele; qualquer outro conector não regulado segue recusado. Proibido em produção. Veja
  [docs/open-finance.md](docs/open-finance.md), seção 10.
- **Publicação gratuita no Render:** `render.yaml` (API em Docker + app web estático) e [docs/deploy-render.md](docs/deploy-render.md),
  com as limitações do plano gratuito (a API dorme após 15 min sem tráfego). Ainda não executado no Render.
- **Log geral do servidor:** a API grava `api-AAAA-MM-DD.log` (tudo) e `errors-AAAA-MM-DD.log` (só avisos e erros)
  em `.data/logs` (desenvolvimento) ou em `LOG_DIR`, com troca diária e retenção configurável (`LOG_RETENTION_DAYS`,
  padrão 30 dias). Cada linha de requisição autenticada carrega o id do usuário (`uid`) e o id da requisição.
  Recusas (401, 404, 422...) são registradas com o código estável, e os campos inválidos aparecem só pelo **nome**.
  Falhas fatais do processo (`uncaughtException`, `unhandledRejection`) são gravadas antes de ele encerrar.
  Veja [docs/logs.md](docs/logs.md).
- **Registro de erros no app:** exceções, promessas rejeitadas, `console.error`, telas quebradas e falhas do
  servidor ficam guardados no aparelho (últimos 300 eventos, repetições agrupadas) e podem ser vistos, compartilhados
  ou apagados em *Mais → Configurações → Diagnóstico*.
- **Relatórios de erro ao servidor** (`POST /v1/diagnostics/client-errors`): o app envia os erros técnicos ao
  log da API (`source: "client"`), sem dados pessoais (e-mails, tokens, valores e números longos são removidos
  dos dois lados). O usuário pode desligar o envio.
- **Tela de erro amigável** (`ErrorBoundary`): se uma tela quebrar, o app mostra "Algo deu errado / Tentar de novo"
  em vez de ficar em branco, e o erro é registrado.
- Este `CHANGELOG.md`.
- **Testes:** 432 automatizados (compartilhado 76, banco 28, app 36, API 292).

### Alterado
- `pnpm dev:db` e `pnpm dev:api` agora explicam, em português, quando a porta já está em uso (o banco ou a API já
  estão rodando em outro terminal) e como achar o processo, em vez de falhar com `undefined`/`EADDRINUSE`.

- Revogar o Open Finance agora também apaga os investimentos, as fotos diárias e as transações do banco ainda não
  revisadas (as já importadas continuam suas). A exportação de dados (LGPD) inclui os investimentos.
- O widget do Pluggy pede explicitamente `ACCOUNTS`, `CREDIT_CARDS`, `TRANSACTIONS` e `INVESTMENTS`, para o
  consentimento no app do banco cobrir tudo o que o app mostra.

### Corrigido
- **App web expunha a estrutura interna:** qualquer endereço inexistente (ex.: `/admin`) abria a tela padrão do Expo Router com um link
  *Sitemap*, e `/_sitemap` (aberto sem login) listava os arquivos de rota e a versão do Expo. Não havia tela de administração nem acesso a
  dados (a API continua exigindo login e papel de administrador), mas a informação era pública. Agora a rota `_sitemap` está desligada
  (`sitemap: false`) e há uma tela própria de "Página não encontrada".
- Cadastro com o e-mail embutido do Supabase (2 por hora, só para a equipe do projeto): o limite de envio virou o erro claro
  `429 EMAIL_RATE_LIMITED` e o endereço não autorizado virou `503 EMAIL_DELIVERY_RESTRICTED` (antes pareciam "muitas requisições" ou
  "senha incorreta"). O guia explica as saídas (SMTP próprio, ou desligar "Confirm email" só em teste fechado).
- Site publicado sem `EXPO_PUBLIC_API_URL` chamava `http://localhost:3000` e só mostrava erro de rede/CORS; agora o app registra um
  aviso claro no console e em *Diagnóstico* (`[config] Este site ... está apontando para a API local`).
- Publicação no Render: o `Dockerfile` da API não copiava o `tsconfig.base.json` (o build parava no `prisma generate`), e o build do site
  usava `npm install -g pnpm`, que o Render bloqueia (sistema de arquivos somente leitura); agora usa `npx pnpm@12.9.1`.
- Exclusão de conta (LGPD) com as **chaves novas do Supabase** (`sb_secret_...`): a chave era enviada também em
  `Authorization: Bearer`, onde o Supabase só aceita JWT; agora as chaves novas vão só em `apikey` (as legadas seguem
  nos dois cabeçalhos). Primeiros testes do provedor Supabase.
- Gráfico de barras do Início: aviso de chaves duplicadas do React quando os valores do eixo eram pequenos
  (a escala repetia rótulos ao arredondar centavos).
- Cartão ligado ao banco mostrava uma fatura em aberto maior que a real, porque o pagamento feito pela conta não era
  reconhecido; a tela de detalhe do cartão também ignorava os números do banco.
- Ordem das contas na conexão (conta antes do cartão) não era garantida quando nasciam no mesmo instante
  (causava falha intermitente nos testes).
- Autenticação de desenvolvimento: o servidor em execução não via a conta recriada por `pnpm dev:seed -- --reset`
  ("Esta conta foi excluída" no login); agora relê o arquivo de usuários quando ele muda.

## [0.1.0] — 2026-10-04 (beta, ainda não publicado nas lojas)

Primeira versão completa do produto, construída em etapas.

### Adicionado
- **Banco de dados (Postgres + Prisma):** 25 tabelas, valores em centavos, exclusão lógica, restrições de integridade,
  chaves estrangeiras compostas `(user_id, id)` e **Row Level Security** em todas as tabelas; catálogo de bancos e
  categorias padrão.
- **API (Fastify + Zod):** autenticação (Supabase Auth e modo de desenvolvimento), perfil, contas, cartões, faturas,
  lançamentos (parcelados, transferências, idempotência para fila offline), categorias, recorrências, orçamentos,
  metas, dashboard com insights, relatórios (6 tipos de gráfico, períodos), notificações (push), LGPD
  (consentimentos, exportação, exclusão de conta), administração e jobs agendados (recorrências, lembretes,
  exclusões pendentes, manutenção).
- **App (Expo / React Native):** login, cadastro e recuperação de senha; Início, Transações, Gráficos, Carteira
  (contas e cartões) e Mais; lançamento rápido com modo offline e sincronização; faturas e pagamento; orçamentos,
  metas, categorias, recorrências, notificações; configurações (tema, notificações, biometria, senha);
  privacidade (exportar e excluir dados); modo claro e escuro.
- **Open Finance (Pluggy), desligado por padrão:** porta de provedor trocável, adaptador Pluggy, conexão de bancos
  regulados, vínculo de contas e cartões, revisão/importação/conciliação de transações, webhooks idempotentes e
  revogação (ver [docs/open-finance.md](docs/open-finance.md)).
- **Planos Free × Premium** com limites aplicados no servidor (beta: todos têm Premium).
- **Deploy:** `Dockerfile`, `fly.toml`, CI e deploy manual no GitHub Actions, `eas.json`; guia completo em
  [docs/deploy.md](docs/deploy.md). Documentação de banco, LGPD, produto/admin e Open Finance.
- **Testes:** 347 automatizados (compartilhado 69, banco 28, app 22, API 228).

### Segurança
- Isolamento de dados por usuário em três camadas (API, chaves compostas, RLS).
- IP nunca guardado em claro (HMAC com segredo do servidor); logs sem senha, token nem corpo de requisição.
- Open Finance: o widget só lista bancos regulados; a API confere a posse da conexão; webhook com segredo em
  cabeçalho, comparado em tempo constante; revogação confirmada no provedor antes de apagar contas.
- Configuração de produção falha cedo se faltar variável obrigatória ou se o modo de desenvolvimento estiver ligado.

### Corrigido durante a construção
- Imagem de produção não encontrava o pacote `pg` (agora é dependência declarada da API).
- Tela "Nova categoria" quebrava (leitura antecipada de `initial.id` pelo React Compiler).
- Banco de desenvolvimento antigo não recebia migrações novas (agora o `dev-db` aplica as pendentes ao subir).
- Arredondamento de centavos vindos do Pluggy (`1.005 × 100`).
- Rótulo "No limite" em orçamentos com folga virou "Dentro do limite".

### Limitações conhecidas
- Falta a tela de redefinição de senha no app (o e-mail de recuperação já funciona).
- Open Finance só foi validado com provedor simulado; cobrança do Premium e painel admin web não existem.
- Telas do app sem testes automatizados; sem verificação em aparelho real (iOS/Android).

[Não lançado]: https://github.com/Ab3lFonseca/projeto-financa/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Ab3lFonseca/projeto-financa/releases/tag/v0.1.0
