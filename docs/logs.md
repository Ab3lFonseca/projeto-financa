# Logs e diagnóstico — como investigar um erro

Existem dois registros que se complementam: o **log do servidor** (tudo que a API faz) e o **registro do app**
(o que aconteceu no celular, inclusive o que nunca chegou ao servidor). Os erros do app também vão para o log do
servidor, então, na prática, **um lugar só** resolve a maioria dos casos.

## 1. Log do servidor (API)

| Onde | Arquivos |
|---|---|
| Desenvolvimento | `.data/logs/` na raiz do projeto |
| Produção (Fly) | Só o console: `fly logs`. Para guardar em disco, monte um volume e defina `LOG_DIR=/data/logs` |

- `api-AAAA-MM-DD.log` — **tudo** (requisições, recusas, jobs, erros). Uma linha JSON por evento.
- `errors-AAAA-MM-DD.log` — **só warn, error e fatal**. É o primeiro arquivo a abrir quando algo der errado.
- Troca de arquivo a cada dia; arquivos com mais de `LOG_RETENTION_DAYS` dias (padrão 30) são apagados sozinhos.
- Se o disco falhar, a API **não cai**: avisa uma vez no console e continua só com o console.

### Campos de cada linha

| Campo | Significado |
|---|---|
| `level` | 30 info · 40 warn · 50 error · 60 fatal |
| `time` | Instante (milissegundos desde 1970) |
| `reqId` | Id da requisição (também devolvido ao app no cabeçalho `x-request-id` e no corpo do erro) |
| `uid` | Id do usuário (pseudônimo; só em requisições autenticadas) |
| `msg` | Descrição (`request completed`, `requisição recusada`, `erro não tratado`, `[app] ...`) |
| `code` / `status` | Em recusas: código estável da API (`VALIDATION_ERROR`, `PLAN_LIMIT_REACHED`...) e status HTTP |
| `fields` | Em erros de validação: **nomes** dos campos inválidos (nunca os valores) |
| `err` | Erro com pilha (`type`, `message`, `stack`) |
| `source: "client"` | Evento enviado pelo app (veja a seção 3) |

**O que nunca é registrado:** senha, token, corpo de requisição, valores financeiros, e-mail, IP em claro.

### Receitas (PowerShell, na raiz do projeto)

```powershell
# Últimos erros do dia
Get-Content .data\logs\errors-$(Get-Date -Format yyyy-MM-dd).log -Tail 20

# Tudo que aconteceu numa requisição (o usuário informa o requestId que aparece no erro)
Select-String -Path .data\logs\api-*.log -Pattern "b1135df9-3aa5-4bbd-ba33-30c05e5902a7"

# Tudo de um usuário (id do usuário)
Select-String -Path .data\logs\api-*.log -Pattern '"uid":"ID-DO-USUARIO"'

# Só erros que vieram do app
Select-String -Path .data\logs\errors-*.log -Pattern '"source":"client"'

# Linhas legíveis (precisa do Node): mostra hora, nível e mensagem
Get-Content .data\logs\errors-*.log | ForEach-Object { $l = $_ | ConvertFrom-Json; "{0} {1} {2}" -f ([DateTimeOffset]::FromUnixTimeMilliseconds($l.time).LocalDateTime.ToString("yyyy-MM-dd HH:mm:ss")), $l.level, $l.msg }
```

## 2. Registro do app (no aparelho)

*Mais → Configurações → Diagnóstico* mostra os últimos 300 eventos: exceções não tratadas, promessas rejeitadas,
`console.error`, telas quebradas e falhas de conexão/servidor (com o `requestId` para achar a linha correspondente
no log da API). Dali dá para **compartilhar o registro** (arquivo `.txt`) ou apagá-lo. Eventos repetidos em
sequência aparecem uma vez com `×N`.

## 3. Envio dos erros ao servidor

Com a opção **Enviar relatórios de erro** ligada (padrão), o app manda os erros e avisos técnicos ao servidor
(`POST /v1/diagnostics/client-errors`): ao entrar, ao voltar ao app e cerca de 5 segundos depois de um novo erro.
No log da API aparecem como `[app] mensagem`, com `source: "client"`, versão do app, plataforma, tela, contexto e
o `uid` do usuário. Regras:

- Só com sessão aberta; no máximo 30 envios por hora por usuário; no máximo 20 eventos por envio.
- Nada pessoal: o app e o servidor removem e-mails, tokens, valores em reais e sequências longas de dígitos.
- Se estiver sem internet, os eventos ficam guardados e seguem depois.

## 4. Falhas fatais

`uncaughtException` e `unhandledRejection` na API são gravadas com pilha (`level: 60`) e o processo encerra
logo depois; no Fly, a máquina sobe de novo sozinha. No app, exceções não tratadas são gravadas no disco antes de
o aplicativo fechar.

## 5. Variáveis

| Variável | Padrão | Para quê |
|---|---|---|
| `LOG_LEVEL` | `info` | Nível mínimo (`debug` mostra mais detalhes) |
| `LOG_DIR` | `.data/logs` em desenvolvimento; vazio em produção | Pasta dos arquivos de log |
| `LOG_RETENTION_DAYS` | `30` | Dias de arquivos mantidos |
| `TEST_LOG` | — | Em testes, `TEST_LOG=1` liga o log (por padrão ele fica em silêncio) |

## 6. LGPD

Os logs podem conter o id do usuário (pseudônimo). Ao **excluir a conta**, os arquivos de log **não** são
reescritos: eles expiram sozinhos pela retenção (30 dias por padrão). Mantenha a retenção curta e cite isso na
Política de Privacidade (ver [lgpd.md](lgpd.md)). Não envie arquivos de log a terceiros sem revisá-los antes.
