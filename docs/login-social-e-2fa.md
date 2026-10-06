# Login por outras contas, verificação em duas etapas e Minha conta

Três recursos de conta, todos apoiados no **Supabase Auth** (nenhuma senha, segredo de código ou token de rede social passa pelo nosso banco):

1. **Cadastro e login por outras contas** (Google, Facebook, Apple, Microsoft, X, Discord, LinkedIn, GitHub).
2. **Verificação em duas etapas (2FA)** com aplicativo autenticador (TOTP), perguntada uma vez no primeiro acesso.
3. **Minha conta**: dados de cadastro, trocar nome, e-mail e senha, com **limites por mês e por ano**.

> **Instagram:** a Meta não oferece login próprio do Instagram para aplicativos de terceiros. Quem usa Instagram entra pelo botão do **Facebook**
> (mesma conta Meta). Por isso não há botão "Instagram".

## 1. Login por outras contas

Fluxo (PKCE, sem expor segredos): o aparelho gera um segredo (`verifier`) e manda só o SHA-256 dele (`challenge`) ao servidor → o servidor devolve o
endereço do provedor → a pessoa autoriza → o provedor devolve um `code` ao endereço de retorno → o app troca `code` + `verifier` por uma sessão. Quem
interceptar o `code` não consegue usá-lo sem o `verifier`, que nunca saiu do aparelho. O endereço de retorno vem **da configuração do servidor**
(nunca do aplicativo), então não há redirecionamento aberto.

Conta nova criada por login social cai na tela de **aceite dos Termos e da Política**, como no cadastro por e-mail. O nome vem do provedor.
Se o e-mail já tinha conta com senha, o Supabase liga as duas formas de entrar na **mesma** conta (e-mail verificado).

### Ligar um provedor (uma vez por provedor)

1. **Endereço de retorno do Supabase** (igual para todos os provedores): `https://SEU-PROJETO.supabase.co/auth/v1/callback`.
2. **Google:** [Google Cloud Console](https://console.cloud.google.com) → *APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth*
   (tipo **Aplicativo da Web**) → em *URIs de redirecionamento autorizados* cole o endereço do item 1. Configure a *Tela de consentimento OAuth*.
   Copie o ID e o segredo do cliente.
3. **Facebook:** [Meta for Developers](https://developers.facebook.com) → *Criar app* → adicione o produto **Facebook Login** → em *URIs de redirecionamento
   OAuth válidos* cole o endereço do item 1. Copie o ID e a chave secreta do app. Enquanto o app da Meta estiver em modo de desenvolvimento, só
   testadores cadastrados conseguem entrar: para o público, coloque-o em modo **Ativo** (exige política de privacidade pública e ícone).
4. **Apple, Microsoft, X, Discord, LinkedIn, GitHub:** cada um tem o seu painel de desenvolvedor; o roteiro é o mesmo (criar um app/cliente OAuth, usar o
   endereço do item 1 como retorno, copiar ID e segredo). A Apple exige conta paga de desenvolvedor e, quando um app para iPhone oferece login social,
   as diretrizes da App Store costumam exigir também "Entrar com Apple": confira a regra vigente antes de publicar na loja.
5. No **Supabase → Authentication → Sign In / Providers**: ligue o provedor e cole o ID e o segredo.
6. No **Supabase → Authentication → URL Configuration → Redirect URLs**, acrescente os endereços do passo seguinte.

### Variáveis (no Render, serviço da API)

| Variável | Exemplo | Para quê |
|---|---|---|
| `OAUTH_PROVIDERS` | `google,facebook` | Quais botões aparecem (ids: `google`, `facebook`, `apple`, `azure`, `twitter`, `discord`, `linkedin_oidc`, `github`). Vazio = só e-mail e senha |
| `OAUTH_WEB_REDIRECT_URL` | `https://financa-web.onrender.com/auth/callback` | Para onde o provedor devolve a pessoa **na web** (também vai em *Redirect URLs* do Supabase) |
| `OAUTH_REDIRECT_URL` | `financa://auth/callback` | Idem no **celular** (deep link) |

A API **recusa subir** com provedor desconhecido, com `OAUTH_PROVIDERS` sem endereço de retorno ou com `AUTH_MODE=dev` (o login local de
desenvolvimento não tem login social).

### Quem entra só por rede social

Não tem senha. Por isso: **definir uma senha** não pede a senha atual (pede um login feito há até 10 minutos); **apagar a conta** pede a palavra
`EXCLUIR` e o mesmo login recente; **trocar o e-mail** não é permitido (o e-mail pertence ao provedor). Se o login for antigo, o app pede para entrar de novo.

## 2. Verificação em duas etapas (2FA)

- Aplicativo autenticador (Google Authenticator, Microsoft Authenticator, Authy, 1Password...) lendo um QR, ou digitando a chave.
- **Primeiro acesso:** o app pergunta uma vez se a pessoa quer ativar. Quem responde "Agora não" pode ligar depois em *Configurações → Segurança*.
- Com a 2FA ligada, a API **recusa toda rota** para uma sessão que só digitou a senha (`401 MFA_REQUIRED`); o app pede o código e troca a sessão por uma
  verificada (`POST /v1/auth/mfa/verify`). Vale também para quem entra por Google/Facebook.
- **Trava:** 5 códigos errados em 15 minutos bloqueiam novas tentativas por 15 minutos (`429 MFA_LOCKED`).
- **Desligar** exige um código válido na hora (prova que a pessoa tem o aparelho, não só a sessão aberta).
- **Perdeu o celular?** O suporte desliga a 2FA da conta em *Painel do administrador → Usuários → conta → Remover verificação em duas etapas* (fica na
  auditoria). Não existem códigos de recuperação nesta versão.
- No Supabase, o TOTP vem ligado por padrão (*Authentication → Multi-Factor*). Não é preciso configurar nada além disso.

## 3. Minha conta

*Configurações → Minha conta* mostra: nome, e-mail, data do cadastro, último acesso, fuso, moeda, **aceites dos Termos e da Política (versão e data)**,
formas de entrar, estado da 2FA e um resumo do que a pessoa já registrou (só contagens dos próprios dados).

**Limites de alteração** (janelas móveis de 30 e 365 dias, não o mês do calendário):

| Dado | Por mês | Por ano |
|---|---|---|
| Nome | 2 | 6 |
| E-mail | 1 | 3 |
| Senha | 3 | 12 |

Definir o nome pela primeira vez não conta. Passou do limite: `429 CHANGE_LIMIT_REACHED` com a data em que libera de novo. Só o tipo e o instante de cada
alteração ficam guardados (tabela `account_changes`, 400 dias), nunca o valor.

**Trocar o e-mail:** pede a senha e manda um link de confirmação ao endereço **novo** (o Supabase também pode confirmar no antigo, conforme *Secure email
change*). O e-mail só muda depois do clique. Endereço que já tem outra conta recebe a **mesma resposta** (não revelamos quem está cadastrado).
O destino do link é `EMAIL_CONFIRM_WEB_REDIRECT_URL` / `EMAIL_CONFIRM_REDIRECT_URL` (precisam estar em *Redirect URLs* do Supabase).

**Redefinir senha:** além de *Alterar senha* (com a senha atual), há *Enviar link de redefinição por e-mail*.

## 4. O que o administrador pode fazer

Todas as ações abaixo exigem o papel `ADMIN`, ficam na auditoria **sem dado pessoal** e não valem para outro administrador nem para si mesmo
(exceto onde indicado):

| Ação | Endpoint |
|---|---|
| Excluir a conta de uma pessoa (apagamento definitivo, como o pedido LGPD; cancela assinatura e conexões) | `DELETE /v1/admin/users/:id` `{ confirm: "EXCLUIR" }` |
| Suspender / reativar | `PATCH /v1/admin/users/:id` |
| Promover a administrador / voltar a usuário (contas de `ADMIN_USER_IDS` só se rebaixam tirando o ID de lá) | `POST /v1/admin/users/:id/role` |
| Enviar à pessoa o e-mail de redefinição de senha (o administrador nunca vê nem define a senha) | `POST /v1/admin/users/:id/password-reset` |
| Prorrogar o teste grátis (soma dias; se já venceu, conta de hoje) | `POST /v1/admin/users/:id/trial` `{ days: 1-365 }` |
| Conceder / retirar acesso gratuito (cortesia) | `POST` / `DELETE /v1/admin/users/:id/access` |
| Desligar a 2FA de quem perdeu o celular | `DELETE /v1/admin/users/:id/mfa` |
| Ver a atividade dos administradores (quem fez o quê, em qual conta, quando) | `GET /v1/admin/audit` |

> Depois de definir as variáveis, confira no log do deploy a linha "API no ar". A migration `20261007000100_account_security` aplica sozinha.
