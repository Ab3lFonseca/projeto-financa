# Guia de deploy — do zero até as lojas

Este guia leva o projeto do seu computador até produção: banco, autenticação, API, domínio com
HTTPS, app Android/iOS e publicação nas lojas. Siga na ordem. Onde algo **não foi testado aqui**
(por exemplo, o build Docker, que exige Docker instalado), isso está dito.

> **Estado atual:** o bundle de produção da API foi construído e iniciado contra o Postgres local
> (`/health`, `/ready`, login e dashboard responderam; sem as variáveis obrigatórias ele recusa subir
> em produção). O `Dockerfile`, o `fly.toml` e os workflows do GitHub foram escritos mas **ainda não
> executados** — o primeiro `docker build` real acontecerá no CI do GitHub.

## 1. Custos (consultados em 2026-10-04 nas páginas oficiais)

Preços mudam. Confirme nas fontes antes de contratar.

| Item | Custo | Fonte |
|---|---|---|
| Supabase **Free** (banco 500 MB, 50 mil usuários ativos/mês, SMTP próprio permitido) | US$ 0. **Sem backups.** Projeto é **pausado após 1 semana sem uso** | [supabase.com/pricing](https://supabase.com/pricing) |
| Supabase **Pro** (8 GB, backups diários por 7 dias, nunca pausa) | a partir de US$ 25/mês | idem |
| Fly.io — API (`shared-cpu-1x`, 512 MB) | US$ 3,69/mês. **Não há camada gratuita** para contas novas. IPv4 compartilhado é grátis; saída de dados na América do Sul: US$ 0,04/GB | [docs.fly.io/about/pricing](https://docs.fly.io/about/pricing) |
| EAS (build do app) — plano **Free** | 15 builds Android + 15 iOS por mês, fila de baixa prioridade | [expo.dev/pricing](https://expo.dev/pricing) |
| Google Play Console | US$ 25, **uma única vez** | [Ajuda do Play Console](https://support.google.com/googleplay/android-developer/answer/6112435) |
| Apple Developer Program | US$ 99 **por ano** | [developer.apple.com](https://developer.apple.com/programs/whats-included/) |
| Domínio `.com.br` | ver registro.br (não consultado) | — |
| Pluggy (Open Finance) | teste grátis de 15 dias; **plano "Dados" a partir de R$ 2.500/mês** | [pluggy.ai/pricing](https://www.pluggy.ai/pricing) |

**Custo mínimo para ter um beta no ar:** ~US$ 3,69/mês (API) + domínio + US$ 25 (Play) e, se for ao iPhone,
US$ 99/ano. O Open Finance fica **desligado** até haver receita que pague o plano (seção 12).

## 2. Decisões (Decisão → Motivo → Alternativas → Custo)

**API em Fly.io, região `gru` (São Paulo).**
Motivo: container simples, HTTPS e certificados automáticos, mesma região do banco (latência baixa) e
as tarefas agendadas rodam dentro da API (a máquina precisa ficar ligada).
Alternativas: Render, Railway, Google Cloud Run (escala a zero, mas os jobs em processo parariam),
VPS próprio (mais barato, mais trabalho de manutenção e segurança).
Custo: ver tabela acima.

**Banco e autenticação no Supabase (`sa-east-1`).**
Motivo: Postgres gerenciado com Auth pronto (e-mail, recuperação de senha, JWT), região no Brasil
(LGPD e latência) e o plano gratuito serve para validar o produto.
Alternativas: Neon/RDS + Auth própria ou Clerk/Auth0 (mais peças para operar; mais caro em escala).
Custo: Free até validar; **migre para Pro antes de ter usuários reais** (backups e sem pausa).

**Migrations fora da imagem, por CI/máquina do desenvolvedor.**
Motivo: o Prisma Migrate exige conexão direta; a imagem de produção fica menor e sem o CLI.
Alternativa: `release_command` do Fly (exigiria o CLI do Prisma na imagem). Custo: zero.

**Builds do app com EAS; push via Expo Push.**
Motivo: gera APK/AAB e IPA na nuvem (não exige Mac para iOS) e abstrai FCM/APNs.
Alternativas: build local com Android Studio/Xcode (grátis, exige máquina e Mac). Custo: plano Free basta no início.

> **Sem cartão de crédito?** O Fly.io exige cartão. A alternativa gratuita é o **Render**, com limitações (a API "dorme" após 15 min
> sem tráfego): veja [deploy-render.md](deploy-render.md) e o [`render.yaml`](../render.yaml). O resto deste guia (Supabase, migrations,
> variáveis) vale para os dois.

## 3. Contas que você precisa criar

1. **GitHub** (repositório + CI). 2. **Supabase**. 3. **Fly.io** (exige cartão). 4. **Expo** (expo.dev).
5. **Google Play Console** (US$ 25). 6. **Apple Developer** (US$ 99/ano) — só para iOS.
7. Um **domínio** (para `api.seudominio.com.br` e a página pública da política de privacidade).

Instale as CLIs: `npm i -g eas-cli` e o `flyctl` ([fly.io/docs/flyctl/install](https://fly.io/docs/flyctl/install/)).

## 4. Banco de dados (Supabase)

1. Crie o projeto em **supabase.com → New project**, região **South America (São Paulo)**, senha forte
   (guarde no gerenciador de senhas).
2. Clique em **Connect** (botão no topo da página do projeto; as strings já não ficam em *Project Settings → Database*) e copie:
   - **Session pooler** (porta 5432, usuário `postgres.<projeto>`) → será o `DATABASE_URL` da API **e também o `DIRECT_URL`** das migrations.
     Ela funciona em redes só IPv4 (a maioria das residenciais e o Render).
   - A **Direct connection** (`db.<projeto>.supabase.co:5432`) é **IPv6** por padrão (IPv4 só com um add-on pago), então tende a falhar
     da sua máquina e do Render. Use-a só se a sua rede tiver IPv6.
   Troque `[YOUR-PASSWORD]` pela senha; **caracteres reservados da senha precisam de percent-encoding** (`@` → `%40`, `#` → `%23`,
   `?` → `%3F`, `&` → `%26`, espaço → `%20`), por isso o mais simples é uma senha só com letras e números.
   Para trocar a senha: *Database* (menu lateral) → *Settings* → *Reset database password*.
   *(Nomes e telas do painel mudam; se algo não bater, siga a [documentação do Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres), consultada em 2026-10-04.)*
3. Aplique as migrations da sua máquina (cria tabelas, restrições, RLS e o papel `app_user`):

   ```bash
   # PowerShell (a mesma string do Session pooler do DATABASE_URL)
   $env:DIRECT_URL = "postgresql://postgres.PROJETO:SENHA@HOST-DO-POOLER:5432/postgres"
   pnpm db:deploy
   pnpm db:seed          # catálogo de bancos
   ```
4. **Papel de acesso.** A API conecta com o mesmo papel que rodou as migrations (no Supabase, `postgres`),
   porque os jobs e rotinas administrativas dependem de ignorar o RLS; as requisições de usuário
   trocam para `app_user` por transação (`SET LOCAL ROLE`), então o RLS vale para elas. Detalhes em
   [database.md](database.md). Se um dia usar outro papel de login: `GRANT app_user TO <papel>;`.
   Um papel de API com menos poder exigiria `BYPASSRLS` e **não foi testado**.
5. **Backup.** O plano Free **não tem backup**. Antes de ter usuários reais: migre para o Pro, ou
   agende `pg_dump` criptografado para um armazenamento seu. Nunca publique dumps como artefato público.

## 5. Autenticação (Supabase Auth)

1. **Authentication → Providers → Email**: ligado; **Confirm email: ON** (a API devolve "confirme seu e-mail").
2. **Authentication → Policies/Settings**: senha mínima de **10** caracteres (a API valida 10+ com letras e números).
3. **SMTP próprio** (Authentication → SMTP): o e-mail embutido do Supabase é só para teste: envia **no máximo 2 e-mails por hora**
   e **só para endereços da equipe do projeto** (os demais falham com "Email address not authorized"). Com SMTP próprio o limite inicial
   é de 30 por hora e pode ser ajustado em *Authentication → Rate Limits* (fontes: [auth-smtp](https://supabase.com/docs/guides/auth/auth-smtp) e
   [rate-limits](https://supabase.com/docs/guides/auth/rate-limits), consultadas em 2026-10-04 — confirme os números atuais).
   Use um provedor (Resend, Brevo, Amazon SES, etc.) com o domínio autenticado (SPF/DKIM). Preços do provedor: confirme com ele.
   Quem tenta se cadastrar sem isso recebe `429 EMAIL_RATE_LIMITED` (limite de envio) ou `503 EMAIL_DELIVERY_RESTRICTED` (endereço não autorizado).
4. **URL Configuration**: `Site URL` = site/página do produto; em *Redirect URLs* inclua o deep link
   `financa://reset-password` e as telas de confirmação de e-mail: `financa://confirm-email` (celular) e `https://SEU-SITE/confirm-email` (web).
   A API manda o Supabase redirecionar o link do e-mail de confirmação para elas (`EMAIL_CONFIRM_REDIRECT_URL` e
   `EMAIL_CONFIRM_WEB_REDIRECT_URL`); endereços fora dessa lista são ignorados e ele cai no Site URL.
5. Em **Project Settings → API** copie: `Project URL` (`SUPABASE_URL`), chave **anon/publishable**
   (`SUPABASE_ANON_KEY`) e a chave **service_role** (`SUPABASE_SERVICE_ROLE_KEY` — **secreta**, só no servidor;
   é com ela que a exclusão de conta LGPD apaga o usuário no Auth). **Chaves novas × legadas:** a chave *publishable* (`sb_publishable_...`)
   entra em `SUPABASE_ANON_KEY` e a *secret* (`sb_secret_...`) em `SUPABASE_SERVICE_ROLE_KEY`; as legadas (`anon`/`service_role`, que começam
   com `eyJ`) também servem. As novas não são JWT e a API as envia só no cabeçalho `apikey`. A verificação do login usa o JWKS do próprio
   projeto (`SUPABASE_URL/auth/v1/.well-known/jwks.json`), sem variável extra e sem instalar `@supabase/server`.
6. Traduza os templates de e-mail (Authentication → Email Templates) para português.

> **Lacuna conhecida:** o app ainda **não tem a tela de redefinição de senha** que recebe o link do
> e-mail (`financa://reset-password`). O pedido de recuperação funciona; enquanto a tela não existe,
> a redefinição precisa ser concluída por uma página web sua. Está na lista de pendências do README.

## 6. API no Fly.io

1. Edite `app = "..."` no [`fly.toml`](../fly.toml) (nome único).
2. Primeira vez, na raiz do repositório:

   ```bash
   fly auth login
   fly launch --no-deploy --copy-config        # aceite o nome; NÃO crie Postgres/Redis
   ```
3. Defina os **segredos** (nunca em arquivo versionado). Gere os aleatórios com `openssl rand -hex 32`:

   ```bash
   fly secrets set \
     DATABASE_URL="postgresql://postgres:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres" \
     SUPABASE_URL="https://PROJETO.supabase.co" \
     SUPABASE_ANON_KEY="..." \
     SUPABASE_SERVICE_ROLE_KEY="..." \
     IP_HASH_PEPPER="$(openssl rand -hex 32)" \
     PASSWORD_RESET_REDIRECT_URL="financa://reset-password" \
     CORS_ORIGINS=""
   ```
   (`CORS_ORIGINS` vazio: o app nativo não usa CORS. Só preencha se houver painel web.)
4. Deploy: `fly deploy` (ou o workflow **Deploy da API** no GitHub, que também aplica as migrations).
5. Verifique:

   ```bash
   curl https://SEU-APP.fly.dev/health     # {"status":"ok"}
   curl https://SEU-APP.fly.dev/ready      # {"status":"ready"}  (fala com o banco)
   fly logs
   ```
   A API **recusa subir** em produção se faltarem `SUPABASE_*` ou se `AUTH_MODE=dev`/pepper padrão.
6. A especificação OpenAPI (`/openapi.json`) só é exposta **fora de produção**; para consultá-la, rode a API localmente.

**Importante:** mantenha `min_machines_running = 1` (já está no `fly.toml`). As recorrências, os lembretes
e a finalização de exclusões de conta rodam dentro da API; com a máquina parada eles atrasam. Com
**mais de uma máquina** não há duplicidade: cada job usa `pg_advisory_xact_lock`.

## 7. Domínio e HTTPS

1. `fly certs add api.seudominio.com.br`
2. No DNS do domínio, crie os registros que o comando indicar (CNAME para `SEU-APP.fly.dev`, ou A/AAAA).
3. `fly certs show api.seudominio.com.br` até aparecer *Issued*. O Fly renova o certificado sozinho.
4. Teste: `curl https://api.seudominio.com.br/health`. A API já envia HSTS e demais cabeçalhos (Helmet).
5. Atualize `EXPO_PUBLIC_API_URL` em [`apps/mobile/eas.json`](../apps/mobile/eas.json) (perfis `preview` e `production`).

## 8. Primeiro administrador

Não existe cadastro de admin pela API (de propósito). Depois de criar sua conta pelo app, há dois caminhos:

**Pela configuração (recomendado):** copie o *User UID* da sua conta (Supabase → Authentication → Users) e defina no servidor
`ADMIN_USER_IDS=<uid>` (vários IDs, separados por vírgula). No Render: **financa-api → Environment**. Na próxima vez em que a conta
entrar, a API a promove a `ADMIN` no banco (idempotente, auditado como `admin.bootstrap`). Fica na configuração, e não no código, porque
o repositório é público. Remover um ID da variável **não** rebaixa ninguém: isso se faz no banco.

**Pelo banco:**

```sql
UPDATE users SET role = 'ADMIN' WHERE email = 'voce@seudominio.com.br';
```
Rode no SQL Editor do Supabase.

Quem é administrador vê, em **Mais**, o *Painel do administrador* (usuários, números do app) e o *Diagnóstico* (registro de erros e
respostas da API), que **não aparecem para mais ninguém**. Os endpoints administrativos ficam em `/v1/admin/*` (ver
[produto-e-admin.md](produto-e-admin.md)).

## 9. App mobile

### 9.1 Antes do primeiro build

- **Identificador do app** (`APP_ID` em [`apps/mobile/app.config.ts`](../apps/mobile/app.config.ts)):
  hoje é `app.financapessoal.mobile`, um **placeholder**. Troque por um domínio **seu** invertido
  (ex.: `br.com.seudominio.financa`). **Não dá para mudar depois de publicar.**
- **Dados da empresa** nos textos legais ([`legal.ts`](../apps/mobile/src/content/legal.ts)): defina, em
  `apps/mobile/eas.json` → `build.production.env` (e `preview`), as variáveis `COMPANY_NAME`, `COMPANY_CNPJ`,
  `COMPANY_DPO_EMAIL`, `COMPANY_SUPPORT_EMAIL` e `COMPANY_CITY`. Enquanto não definidas, o app mostra
  `[NOME DA EMPRESA]` etc. Os textos são **modelos**: peça revisão jurídica antes de publicar.
- **Ícones:** os de `apps/mobile/assets/` foram gerados por script (placeholder). Substitua pelos definitivos
  (`icon.png` 1024×1024, `adaptive-icon.png`, `splash-icon.png`).
- `pnpm --filter @app/mobile typecheck` e `pnpm test` devem passar.

### 9.2 Contas e primeiro build

```bash
cd apps/mobile
eas login
eas init                              # cria o projeto e grava o projectId (EAS_PROJECT_ID)
eas build -p android --profile preview      # APK para instalar e testar no celular
eas build -p android --profile production   # AAB para a Play Store
```
- O `preview` gera um **APK** que você baixa e instala direto no aparelho (use para o teste com amigos).
- O `production` gera o **AAB** exigido pela Play Store. `autoIncrement` cuida do `versionCode`.
- Na primeira vez o EAS pergunta se pode gerar a chave de assinatura: aceite (ele guarda para você; faça
  `eas credentials` para baixar um backup).
- **Notificações push no Android** exigem uma conta Firebase (FCM): siga *Expo → Push notifications → FCM credentials*
  e envie a chave com `eas credentials`. Sem isso o app funciona, só não recebe push. Não versione
  `google-services.json`.

### 9.3 Testar no celular

Veja o README → "Como testar". Para um build instalável de teste use o perfil `preview`.

## 10. Google Play

1. Crie a conta no [Play Console](https://play.google.com/console) (US$ 25, uma vez; verificação de identidade).
2. **Criar app** → idioma pt-BR, tipo App, gratuito.
3. **Política de Privacidade:** a Play exige uma **URL pública**. Publique o texto de
   `src/content/legal.ts` numa página sua (`https://seudominio.com.br/privacidade`) e informe a URL.
4. **Segurança dos dados (Data safety):** declare o que o app coleta — e-mail, dados financeiros informados
   pelo usuário, identificadores de dispositivo (token de push) — e que há exclusão de conta dentro do app
   (existe: *Mais → Privacidade e dados*). O app **não** usa câmera, localização nem contatos.
5. Preencha classificação etária, categoria (Finanças), contato e ficha da loja (textos, capturas de tela).
6. **Contas pessoais novas** precisam cumprir uma etapa de **teste fechado** com testadores antes de pedir
   produção. Os números exatos (testadores e dias) estão no Help Center do Google e mudam: **confira lá**
   (não consegui confirmar na página consultada).
7. Envie o AAB: `eas submit -p android --profile production` (exige uma chave de serviço da Play) **ou** faça
   o upload manual do `.aab` em *Testes → Teste interno/fechado*.
8. Após aprovado o teste fechado, solicite acesso à **produção** e publique.

## 11. Apple App Store

1. Entre no [Apple Developer Program](https://developer.apple.com/programs/) (US$ 99/ano).
2. Crie o app no App Store Connect com o mesmo `bundleIdentifier` do `app.config.ts`.
3. `eas build -p ios --profile production` (o EAS cuida de certificados; **não exige Mac**).
4. `eas submit -p ios` e distribua primeiro via **TestFlight**.
5. Preencha os **rótulos de privacidade** (e-mail, dados financeiros, identificadores) e a URL da política.
6. Regras que o app já cumpre: **exclusão de conta dentro do app** e justificativa do Face ID
   (`NSFaceIDUsageDescription`). Nas *notas para o revisor* informe uma conta de teste (crie uma só para isso).
7. Se um dia cobrar assinatura **dentro do app**, a Apple exige o fluxo de compra dela (comissão: ver o
   programa); a base de planos já existe, mas **a cobrança não está implementada**.

## 12. Open Finance (opcional)

Está **desligado** (`OPEN_FINANCE_ENABLED=false`) porque o provedor é pago (seção 1). Quando decidir ligar:
[open-finance.md](open-finance.md). Nunca defina `OPEN_FINANCE_PROVIDER=demo` em produção (a API recusa subir;
o modo demonstração é só para testar localmente). A migração `open_finance_investments_cards` (investimentos, dados
de cartão e `auto_import`) é aplicada junto com as demais (passo 3 da seção 4 e no workflow de deploy da seção 6).

## 13. Operação

- **Logs:** `fly logs`. Os logs não contêm senha/token (há *redaction*) nem corpo de requisição.
- **Monitor externo:** configure qualquer monitor HTTP gratuito em `https://api.seudominio.com.br/ready`.
  O health check do Fly já consulta `/ready` a cada 30 s (isso também mantém o banco "ativo").
- **Atualizar:** `fly deploy` (a troca é gradual). **Reverter:** `fly releases` e `fly deploy --image <imagem anterior>`.
  Migrations só avançam: escreva migrations compatíveis com a versão anterior da API.
- **Segredos:** troque com `fly secrets set` (reinicia a API). Se vazar a `service_role`, gere outra no Supabase.
- **LGPD:** pedidos de exclusão se completam sozinhos; um job retoma os que falharam. Ver [lgpd.md](lgpd.md).

## 14. Checklist de produção

- [ ] `AUTH_MODE` não é `dev`; `NODE_ENV=production`.
- [ ] `IP_HASH_PEPPER` gerado por você; `SUPABASE_SERVICE_ROLE_KEY` só no servidor.
- [ ] Confirmação de e-mail ligada e SMTP próprio configurado.
- [ ] Plano do Supabase com backup (Pro) **ou** rotina de `pg_dump` sua.
- [ ] Domínio com HTTPS emitido; `EXPO_PUBLIC_API_URL` apontando para ele.
- [ ] `APP_ID` próprio; textos legais revisados e com os dados da empresa; URL pública da política.
- [ ] Ícones definitivos.
- [ ] Primeiro admin criado; `BILLING_ENFORCED` decidido.
- [ ] `pnpm test` e `pnpm typecheck` verdes no CI.

## 15. Variáveis de ambiente

Lista completa e comentada em [`.env.example`](../.env.example). Resumo do que **vai no Fly (segredos)**:
`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_PEPPER`,
`PASSWORD_RESET_REDIRECT_URL` e, se ligar o Open Finance, `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`,
`PLUGGY_WEBHOOK_SECRET`, `OPEN_FINANCE_REDIRECT_URI`. As não secretas já estão no `fly.toml`.
No **GitHub (Actions → Secrets)**: `FLY_API_TOKEN` e `DIRECT_URL`.
No **app**: apenas `EXPO_PUBLIC_API_URL` (não é segredo) e `EAS_PROJECT_ID`.
