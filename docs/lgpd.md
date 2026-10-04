# LGPD — como o produto atende

> Este documento descreve o que o **software** faz. Não é parecer jurídico: a política e os termos do app
> são **modelos** que precisam de revisão por advogado, com os dados reais da empresa e do Encarregado (DPO).

## 1. Dados tratados e finalidade

| Dado | Finalidade | Onde fica |
|---|---|---|
| E-mail e senha | Autenticação | Supabase Auth (a senha nunca passa pelo nosso banco) |
| Nome de exibição, fuso, tema, preferências | Personalização | `profiles` |
| Contas, cartões, lançamentos, categorias, orçamentos, metas, recorrências | Função principal do app (informados pelo usuário) | tabelas com `user_id` |
| Consentimentos | Prova de aceite (versão + data + hash do IP) | `consents` |
| Token de push, nome do aparelho | Avisos | `push_tokens` |
| Conexões, contas, cartões, transações e **investimentos** do banco (Open Finance, se ligado) | Importar e mostrar os dados do banco com consentimento específico (somente leitura) | `bank_connections`, `bank_connection_accounts`, `bank_transactions`, `bank_investments`, `bank_investment_snapshots` |
| Auditoria (ações sensíveis) | Segurança e prova | `audit_logs` (sem valores financeiros) |
| Logs técnicos da API e relatórios de erro do app | Segurança, estabilidade e correção de falhas | Arquivos de log do servidor (id do usuário como pseudônimo; sem e-mail, valores, tokens nem corpo de requisição). O envio de erros do app pode ser desligado em *Configurações → Diagnóstico* ([logs.md](logs.md)) |

Não coletamos localização, contatos, câmera nem identificadores de publicidade. **IP nunca é guardado em claro**:
só um HMAC com segredo do servidor (`IP_HASH_PEPPER`).

## 2. Direitos do titular

| Direito | Como é atendido no app |
|---|---|
| Acesso e portabilidade | *Mais → Privacidade e dados → Exportar meus dados* (JSON completo; limitado a 3/hora) |
| Correção | O próprio usuário edita tudo no app |
| Eliminação | *Excluir minha conta*: exige senha + digitar "EXCLUIR"; apaga o usuário no Auth e **todos** os dados por cascata (`user_id`). Um teste automatizado cobre todas as tabelas com `user_id`. A prova do pedido permanece **sem dado pessoal** |
| Revogação de consentimento | Marketing e Open Finance podem ser retirados a qualquer momento; retirar Open Finance **encerra as conexões no provedor** |
| Informação sobre tratamento | Política de Privacidade dentro do app (e URL pública nas lojas) |
| Revisão/ANPD | Canal do DPO descrito na política |

Termos e Política têm **versão**: ao mudar `LEGAL_TERMS_VERSION`/`LEGAL_PRIVACY_VERSION`, o app bloqueia o uso
(`403 CONSENT_REQUIRED`) até o novo aceite.

## 3. Retenção

Dados financeiros do usuário duram enquanto a conta existir. Dados operacionais são limpos pelo job de
manutenção (a cada 6 h):

| Dado | Prazo |
|---|---|
| Chaves de idempotência | 48 horas |
| Eventos de webhook | 30 dias |
| Auditoria | 180 dias |
| Notificações lidas | 90 dias |
| Tokens de push sem uso | 180 dias |
| Transações brutas do banco não aproveitadas | apagadas ao revogar a conexão |
| Investimentos do banco e a foto diária de cada um | enquanto a conexão existir; apagados ao revogar a conexão (as transações já importadas continuam sendo do usuário) |
| Arquivos de log da API | 30 dias (`LOG_RETENTION_DAYS`); **não** são reescritos ao excluir uma conta, expiram pela retenção |
| Registro de erros no aparelho | últimos 300 eventos; o usuário pode apagar; some ao desinstalar o app |

## 4. Segurança (resumo)

- Isolamento por usuário em 3 camadas: filtro na API, chaves estrangeiras compostas `(user_id, id)` e **Row Level Security**
  (requisições rodam como `app_user`). Sem `app.user_id`, nenhuma linha é visível.
- Tokens no aparelho em armazenamento seguro (Keychain/Keystore); bloqueio opcional por biometria.
- HTTPS obrigatório, cabeçalhos de segurança, limite de taxa, validação de entrada com Zod e corpo limitado a 512 KB.
- Logs sem senha, tokens ou corpo de requisição.
- Exclusão de conta resiliente: se uma etapa falhar, um job retoma (a conta fica bloqueada nesse meio-tempo).

## 5. Operadores/suboperadores (confirme e cite na política)

Supabase (banco e autenticação, região São Paulo), Fly.io (hospedagem da API), Expo (entrega de push),
provedor de SMTP escolhido (e-mails de conta) e, se ligado, Pluggy (Open Finance). Verifique onde cada um
armazena/processa dados e se precisa de cláusulas de transferência internacional.

## 6. Pendências (não são código)

- [ ] Revisão jurídica dos Termos e da Política; dados reais da empresa (`COMPANY_*`).
- [ ] Nomear o Encarregado (DPO) e publicar o canal.
- [ ] Relatório de impacto (RIPD) se o volume/risco justificar, especialmente com Open Finance.
- [ ] Plano de resposta a incidentes (prazo de comunicação à ANPD e aos titulares).
- [ ] Contratos/DPAs com os operadores da seção 5.
- [ ] Backups: o plano gratuito do Supabase não tem; backups também são dados pessoais (retenção e exclusão).
