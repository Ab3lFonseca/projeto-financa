# Publicar no Render (plano gratuito)

Alternativa **gratuita** ao Fly.io ([deploy.md](deploy.md)) para ter a API e o app web num endereço público com HTTPS,
sem cartão de crédito. O arquivo [`render.yaml`](../render.yaml) descreve os dois serviços; você só preenche os segredos.

## 1. Decisão → Motivo → Alternativas → Custo

- **Decisão:** API (imagem Docker) e app web (site estático) no **Render, plano free**; banco e login no **Supabase** (free).
- **Motivo:** custo zero para testar com gente de verdade, HTTPS público (o Pluggy exige HTTPS para webhook e retorno do banco)
  e o app web acessível do celular, sem build nativo.
- **Alternativas:** Fly.io (exige cartão; é o caminho do [deploy.md](deploy.md), em São Paulo, sem "dormir"); Postgres do
  próprio Render (descartado: o gratuito **expira em 30 dias**, não tem backup e o login precisaria de qualquer jeito do Supabase).
- **Custo:** R$ 0 no Render. Supabase: veja a seção 1 do [deploy.md](deploy.md). Dados do Render consultados em 2026-10-04 em
  [render.com/docs/free](https://render.com/docs/free) e [render.com/docs/regions](https://render.com/docs/regions) — confirme antes de depender deles.

## 2. O que o plano gratuito muda (leia antes)

| Limite do Render free | Efeito no app |
|---|---|
| **Dorme após 15 min sem tráfego**; acordar leva cerca de 1 minuto | O primeiro acesso depois de um tempo parado demora (a tela pode mostrar erro de rede e funcionar na segunda tentativa) |
| Os **jobs rodam dentro da API** | Com a API dormindo, recorrências, lembretes e a atualização do Open Finance **atrasam** até alguém abrir o app (ou um monitor externo "bater" nela) |
| 750 horas gratuitas por mês por workspace | Uma API ligada o mês todo cabe; vários serviços não |
| Sem disco persistente | Por isso o login não pode ser o modo `dev` (guarda usuários em arquivo): use o Supabase |
| Sem região no Brasil (oregon, ohio, virginia, frankfurt, singapore) | O `render.yaml` usa **virginia**, a mais próxima; espere ~100–150 ms a mais por requisição |
| Webhook do Pluggy deve responder rápido | Acordando do sono pode estourar o prazo. O webhook é só um gatilho: a API também atualiza pelo job e pelo botão "Atualizar" |

Isso serve para **testar**. Para uso real e contínuo, prefira o Fly.io (ou um plano pago do Render) para a API não dormir.

## 3. Passo a passo

1. **Supabase** (uma vez): siga as seções 4 e 5 do [deploy.md](deploy.md) — projeto, migrations (`pnpm db:deploy` e `pnpm db:seed` da
   sua máquina, com a string do **Session pooler** também no `DIRECT_URL`) e as chaves. Você vai precisar de: `DATABASE_URL` (**Session pooler**, que funciona em IPv4;
   a *Direct connection* é IPv6 e costuma falhar), `SUPABASE_URL`,
   `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. A imagem da API não tem o CLI do Prisma e o Render free não roda tarefas avulsas: as migrations
   são sempre aplicadas por você, da sua máquina (ou pelo workflow do GitHub).
2. No [Render](https://render.com): **New → Blueprint** → conecte o GitHub e escolha este repositório. Ele lê o `render.yaml` e
   pergunta os valores marcados com `sync: false`. Se `financa-api`/`financa-web` já existirem no Render, troque os nomes no
   arquivo (eles viram `https://NOME.onrender.com`).
3. Preencha: `DATABASE_URL`, `SUPABASE_*` e, por enquanto, qualquer valor temporário em `CORS_ORIGINS` e `EXPO_PUBLIC_API_URL`.
   `IP_HASH_PEPPER` e `PLUGGY_WEBHOOK_SECRET` o Render gera sozinho.
4. Quando os dois serviços aparecerem, corrija os endereços reais:
   - serviço **financa-api** → *Environment* → `CORS_ORIGINS` = `https://financa-web.onrender.com` (o endereço do site);
   - serviço **financa-web** → *Environment* → `EXPO_PUBLIC_API_URL` = `https://financa-api.onrender.com` (sem barra no final) e
     **Manual Deploy → Deploy latest commit** (o endereço da API é embutido no app durante o build).
5. Teste a API: `https://financa-api.onrender.com/health` deve responder `{"status":"ok"}` e `/ready` `{"status":"ready"}`
   (este fala com o banco; na primeira vez espere o serviço acordar).
6. Abra o site, crie a conta e confirme o e-mail (o e-mail padrão do Supabase tem limite baixo; serve para poucos testes).

### Atualizar

`git push` em `main`: o Render só publica depois que o CI do GitHub passar (`autoDeployTrigger: checksPass`).
Mudou a API, o site não precisa de novo deploy; mudou `EXPO_PUBLIC_API_URL`, sim.

## 4. Ligar o Open Finance (Pluggy) no Render

O guia de credenciais é o [open-finance.md](open-finance.md). No serviço **financa-api** → *Environment*, **você** cadastra
os valores abaixo (segredos nunca vão para o Git nem para uma conversa):

| Variável | Valor |
|---|---|
| `OPEN_FINANCE_ENABLED` | `true` |
| `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` | do painel do Pluggy (**segredos**) |
| `OPEN_FINANCE_WEB_REDIRECT_URI` | `https://financa-web.onrender.com/open-finance` (para onde o banco devolve o usuário no navegador) |

`PLUGGY_WEBHOOK_SECRET` já foi gerado pelo Render (veja em *Environment*). Para cadastrar o webhook no Pluggy, rode da sua máquina
o comando da seção 5 do [open-finance.md](open-finance.md) com esse segredo e a URL `https://financa-api.onrender.com/v1/webhooks/pluggy`.

**Banco real:** com o Pluggy "normal", o widget só mostra **bancos do Open Finance regulado**, e isso exige plano (teste grátis de
15 dias, depois a partir de R$ 2.500/mês — [pluggy.ai/pricing](https://www.pluggy.ai/pricing), consultado em 2026-10-04).

**De graça com a sua conta (MeuPluggy):** o conector MeuPluggy é aceito só com `PLUGGY_ALLOW_MEUPLUGGY=true`, e a API **recusa subir
com essa variável em produção** (o Render roda com `NODE_ENV=production`). Para o teste gratuito use o ambiente local — veja a
seção 10 do [open-finance.md](open-finance.md).

## 5. Quando algo dá errado

- **Build do site falha em "pnpm"/"expo"**: veja o log do deploy no Render. O build roda
  `pnpm install --frozen-lockfile --filter "@app/mobile..."` e `expo export --platform web` (via `npx pnpm@12.9.1`: o Render **não permite
  `npm install -g`**, que falha com `EROFS: read-only file system`); localmente ele leva ~2 min. O Node vem do `.nvmrc` (24).
- **O site abre mas "Servidor indisponível"**: `EXPO_PUBLIC_API_URL` errado (refaça o deploy do site) ou API ainda acordando.
  Se o console do navegador (F12) mostra chamadas para `http://localhost:3000/...` e a mensagem `[config] Este site (...) está apontando
  para a API local`, a variável **não existia durante o build do site**: o endereço da API é gravado no app na hora do build, então
  cadastre `EXPO_PUBLIC_API_URL` em *Environment* **deste** site (nome exato, sem aspas nem barra no final) e faça *Manual Deploy →
  Clear build cache & deploy*. Conferido localmente: com a variável definida e o cache limpo, o endereço entra no site gerado.
  Para o build **avisar sozinho**, use este *Build Command* (ele para com um erro claro se a variável não existir e imprime o endereço
  usado; o `render.yaml` já traz o mesmo):

  ```
  test -n "$EXPO_PUBLIC_API_URL" || { echo "ERRO: a variavel EXPO_PUBLIC_API_URL nao esta definida neste site (aba Environment)"; exit 1; } && echo "API usada pelo site: $EXPO_PUBLIC_API_URL" && npx --yes pnpm@12.9.1 install --frozen-lockfile --filter "@app/mobile..." && npx --yes pnpm@12.9.1 --filter @app/mobile exec expo export --platform web
  ```
- **Erro de CORS no console do navegador** (`Access-Control-Allow-Origin missing`, status 404): `CORS_ORIGINS` precisa ser exatamente o
  endereço do site (com `https://`, **sem barra no final**), na **API** (não no site). Vazia, o CORS fica desligado e o navegador é
  bloqueado. Depois de salvar, é preciso um deploy da API. Confira no log da API ao iniciar: a linha `"API no ar"` mostra
  `"corsOrigins":["https://..."]`; se vier `[]`, a variável não chegou.
- **A API não sobe**: o log mostra qual variável falta (a API recusa produção sem `SUPABASE_*` e pepper próprio).
- Logs: painel do serviço → *Logs*. Dentro do app: *Mais → Configurações → Diagnóstico*.

> **Não validado:** o `render.yaml` e o build estático no Render nunca foram executados (só o build local, que funciona). O primeiro deploy pode
> pedir ajustes pequenos; me mande o log que eu corrijo.
