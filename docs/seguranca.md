# Segurança: testes externos e riscos conhecidos

Resultado dos testes que um colega fez contra o ambiente de testes publicado (2026-10-04, três relatórios), o que foi corrigido e o que
ficou como risco aceito. Esses testes **não certificam** a segurança do sistema: cobriram rotas públicas, o código entregue ao navegador e
a proteção de endpoints sem sessão. Faltam testes autenticados com duas contas (isolamento entre usuários, manipulação de ids,
XSS em campos salvos).

## O que foi confirmado como protegido
`GET /v1/me`, `/v1/accounts`, `/v1/transactions`, `/v1/dashboard` e `/v1/privacy/export` sem sessão → `401`; token inválido → `401 INVALID_TOKEN`;
CORS não libera origens estranhas; 40 requisições sem sessão e 12 logins com corpo inválido não derrubaram nem enganaram a API.

## Achados

| # | Achado | Gravidade | Situação |
|---|---|---|---|
| 1 | **Limite de tentativas contornável**: o `TRUST_PROXY=true` confiava no `X-Forwarded-For` enviado pelo cliente, então trocar o cabeçalho abria um contador novo a cada tentativa (cadastro) | Média | **Corrigido**: `CLIENT_IP_HEADER` (abaixo) |
| 2 | Site sem `X-Frame-Options` nem CSP (risco de clickjacking, não explorado) | Baixa/média | **Corrigido em parte**: `X-Frame-Options: DENY` e CSP com `frame-ancestors 'none'`; CSP completa pendente |
| 3 | Sessão do site guardada em `localStorage` (um XSS leria os tokens; nenhum XSS foi demonstrado) | Baixa, condicionada a XSS | **Risco aceito por enquanto**, com mitigações |
| 4 | `/admin` e `/_sitemap` expunham os nomes dos arquivos de rota e a versão do Expo (não havia tela de admin nem acesso a dados) | Baixa | **Corrigido**: rota `_sitemap` desligada + tela própria de "página não encontrada" |
| 5 | Pedidos com corpo inválido (422) não contam no limite de tentativas (o limitador roda depois da validação) | Baixa | Conhecido: são rejeitados rápido e sem custo de banco |

## 1. IP do cliente (`CLIENT_IP_HEADER`)
Atrás de proxy, `req.ip` precisa ser o IP do cliente real. O `X-Forwarded-For` **não serve**: o Render e o Cloudflare acrescentam ao que o cliente
mandou, então o valor mais à esquerda é do atacante. Agora a API aceita `CLIENT_IP_HEADER` com o nome de um cabeçalho **escrito só pela borda**:
Render (que passa pelo Cloudflare) `cf-connecting-ip`; Fly.io `fly-client-ip`. Com ele definido, o `X-Forwarded-For` é ignorado; valor ausente ou que
não seja um IP válido cai no IP da conexão. Sem ele, em produção, a API avisa no log ao iniciar.

- Premissa: o cliente só alcança a API **passando pela borda**. No Render isso é o caso, e o relatório confirmou que um `CF-Connecting-IP` forjado é
  recusado pelo Cloudflare (`403`, "error code: 1000"). Fontes sobre o comportamento do Render:
  [comunidade Render](https://community.render.com/t/accessing-client-ips-in-a-node-express-app/36282).
- Teste automatizado (`services/api/test/client-ip.test.ts`): reproduz o ataque do relatório (com `TRUST_PROXY=true` o contador abre de novo) e prova que
  com `CLIENT_IP_HEADER` ele continua bloqueado.
- **Critério de validação em produção** (do relatório): depois de esgotar o limite, repetir o mesmo pedido com `X-Forwarded-For` diferente deve continuar
  respondendo `429 RATE_LIMITED`.
- Os contadores ficam na memória da API (uma instância no Render free): reiniciam quando ela reinicia.

## 2. Cabeçalhos do site
Render → site → **Headers** (ou `headers:` no `render.yaml`): `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self';
object-src 'none'; form-action 'self'`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`.
Uma CSP com `script-src`/`connect-src`/`frame-src` completa **ainda não foi aplicada**: ela precisa de teste com o widget do Pluggy (iframe e scripts do Pluggy)
para não quebrar o Open Finance. Próximo passo: publicá-la como `Content-Security-Policy-Report-Only`, olhar o console do navegador e só então impor.

## 3. Sessão no `localStorage` (web)
No app nativo os tokens ficam no armazenamento seguro do aparelho; no navegador, em `localStorage` (chave `session-v1`). Se existisse XSS, um script
leria os tokens. Hoje: o código do app não usa `dangerouslySetInnerHTML`, `innerHTML`, `eval` nem `new Function` (conferido por busca em `apps/mobile/src`),
o React escapa o texto, e o Supabase emite access tokens de vida curta e rotaciona o refresh token por padrão (configurações do projeto Supabase:
confira em *Authentication → Sessions*). Migrar para cookies `HttpOnly` + `Secure` + `SameSite` com proteção CSRF é uma mudança de arquitetura (API e site
em domínios diferentes no Render complicam o `SameSite`) e **não foi feita**. A CSP completa (item 2) é a mitigação mais barata e vem antes.

## 4. E-mail de cadastro e abuso
O cadastro dispara um e-mail de confirmação. Com o limite por IP corrigido, o abuso fica em 5 cadastros por minuto por cliente. O e-mail embutido do Supabase
só envia 2 por hora e só para a equipe do projeto ([deploy.md](deploy.md), seção 5). Ao trocar para SMTP próprio, defina também um teto de envios por hora no
Supabase e avalie um limite por destinatário e uma cota global (ainda não implementados).
