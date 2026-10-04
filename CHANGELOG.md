# Changelog

Todas as mudanças relevantes do projeto ficam aqui. O formato segue o
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

> **Como manter:** toda mudança que o usuário (ou quem opera o app) perceba entra em **[Não lançado]**, na
> categoria certa (Adicionado, Alterado, Corrigido, Segurança, Removido). Ao publicar uma versão, renomeie a seção
> para o número e a data e abra uma nova **[Não lançado]** vazia. Mudanças só internas (refatorações, testes) não precisam entrar.

## [Não lançado]

### Adicionado
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

### Alterado
- `pnpm dev:db` e `pnpm dev:api` agora explicam, em português, quando a porta já está em uso (o banco ou a API já
  estão rodando em outro terminal) e como achar o processo, em vez de falhar com `undefined`/`EADDRINUSE`.

### Corrigido
- Gráfico de barras do Início: aviso de chaves duplicadas do React quando os valores do eixo eram pequenos
  (a escala repetia rótulos ao arredondar centavos).

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
