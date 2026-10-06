# Changelog

Todas as mudanças relevantes do projeto ficam aqui. O formato segue o
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

> **Como manter:** toda mudança que o usuário (ou quem opera o app) perceba entra em **[Não lançado]**, na
> categoria certa (Adicionado, Alterado, Corrigido, Segurança, Removido). Ao publicar uma versão, renomeie a seção
> para o número e a data e abra uma nova **[Não lançado]** vazia. Mudanças só internas (refatorações, testes) não precisam entrar.

## [Não lançado]

### Adicionado
- **Temas prontos em três famílias novas** (*Configurações → Aparência*, que agora agrupa os temas): **Opacos** (cores cheias e chapadas: Oceano, Floresta,
  Vinho, Uva e Brasa), **Foscos** (tons acinzentados, escuros e claros: Grafite, Ardósia, Sálvia, Areia e Malva) e **Pastéis** (claros e delicados: Rosa,
  Menta, Lavanda, Pêssego e Céu). Todos passam pelas mesmas regras de legibilidade dos demais (texto e realces com contraste mínimo, conferidos por teste).
  O tema escolhido continua salvo na conta; um tema que uma versão antiga do app não conhece volta ao do aparelho em vez de quebrar a tela.
- **Segurança e conta (servidor; as telas vêm na sequência).** Verificação em duas etapas (TOTP) com trava de tentativas e perguntada uma vez no primeiro
  acesso; **cadastro e login por Google, Facebook e outras contas** (PKCE, endereço de retorno só da configuração; o Instagram entra pelo Facebook);
  **Minha conta** (dados de cadastro, aceites, trocar nome, e-mail e senha com limites por mês e por ano, link de redefinição por e-mail); contas sem
  senha definem a primeira com login recente. Ver [docs/login-social-e-2fa.md](docs/login-social-e-2fa.md).
- **Mais ferramentas de administrador:** excluir a conta de uma pessoa (apagamento definitivo), promover/rebaixar administradores, enviar redefinição de
  senha, prorrogar o teste grátis, desligar a 2FA de quem perdeu o celular e ver a atividade dos administradores. Tudo auditado, sem dado pessoal.
- **Aviso do teste grátis no primeiro acesso:** o servidor registra quem já viu a mensagem de "30 dias grátis" e a pergunta da 2FA (uma vez só, em qualquer
  aparelho). Quem já tinha conta começa o teste na data `BILLING_STARTS_AT` (administradores nunca são limitados).
- **Assinatura (servidor):** 30 dias de teste grátis com tudo liberado e, depois, mensalidade; sem assinar, o app vira **somente leitura** (consulta e
  exporta, não cria nem edita: `402 SUBSCRIPTION_REQUIRED`; nada é apagado). Pagamento hospedado pelo Stripe (Checkout + portal do cliente; dados de
  cartão nunca passam por aqui), adicional **Rendimentos** como segundo item da assinatura, webhook com assinatura HMAC, idempotente e à prova de eventos
  fora de ordem (o servidor relê a assinatura no Stripe), preços lidos do provedor e nunca no código. Cartão recusado mantém o acesso até o fim do período
  pago; cancelar vale ao fim do período. **Acesso gratuito:** administradores sempre; **cortesia** concedida pelo administrador
  (`POST/DELETE /v1/admin/users/:id/access`, por N dias ou sem prazo, com ou sem Rendimentos, auditada). Vem **desligada** (`BILLING_ENFORCED=false`);
  `BILLING_STARTS_AT` faz as contas antigas começarem o teste na data da cobrança. O painel do administrador ganha o acesso de cada pessoa e os números
  de assinatura (sem dado de pagamento). Guias: [docs/assinatura.md](docs/assinatura.md) e [docs/monetizacao.md](docs/monetizacao.md) (taxas e como cobrar
  de forma rentável). As telas de assinatura no app vêm a seguir.
- **O banco se atualiza sozinho a cada deploy.** O contêiner da API agora roda `prisma migrate deploy` ao iniciar, antes de subir o servidor
  (`docker-entrypoint.sh`, CLI do Prisma fixado na mesma versão do projeto e conferido por teste). Chega de "a API nova leu uma coluna que o banco ainda
  não tem" (erro 500): se uma migration falhar, o contêiner sai com erro, o deploy é dado como falho e a versão anterior continua no ar. A CI sobe a imagem
  contra um Postgres vazio e confere que tudo é aplicado sozinho, que reiniciar não reaplica nada e que um banco inalcançável derruba o contêiner. Desligar:
  `MIGRATE_ON_START=false`. Regra para novas migrations: sempre compatíveis com o código anterior (acrescentar; remover só num segundo deploy).
- **Painel do administrador no app** (*Mais → Painel do administrador*, só para contas `ADMIN`): números de usuários (total, novos, ativos,
  premium, suspensos, quem concluiu o tutorial), cadastros dos últimos 30 dias, temas escolhidos, estado do login/Open Finance/avisos e a **lista de usuários
  com nome, e-mail, plano e situação** (busca por nome ou e-mail, detalhe em folha). Só dados de cadastro: nada de saldos, lançamentos, contas,
  cartões nem bancos conectados. Toda leitura de dados de usuários fica na auditoria sem dados pessoais (`admin.users.listed`, `admin.user.viewed`).
- **Administrador definido na configuração:** `ADMIN_USER_IDS` (UUIDs separados por vírgula) promove a conta a `ADMIN` na primeira vez em que ela é
  vista (idempotente, auditado como `admin.bootstrap`). Fica no painel do Render, e não no código, porque o repositório é público.
- **Movimento e acabamento em todo o app.** Tempos e curvas únicos (`components/ui/motion.ts`) e o "reduzir movimento" do sistema é respeitado.
  Linhas de lista e cartões ganham mola ao tocar e destaque ao passar o mouse; a seta das linhas anda um pouco; a aba ativa tem uma pílula
  animada e troca de aba tem fade; o seletor segmentado tem um marcador que desliza; saldos e totais em destaque **contam até o valor**
  (o número final sempre aparece, mesmo se a animação for interrompida); gráficos entram animados (barras crescem da linha do zero, rosca gira
  para o lugar, linha é revelada); folhas inferiores sobem com mola e desfocam o fundo na web; avisos entram com mola; campos de texto ganham anel
  de foco; botão **+** nasce com mola e gira no hover; telas de entrada têm fundo de luz animado e entrada em cascata; foco por teclado visível,
  barras de rolagem e seleção de texto no tema (CSS global gerado da paleta).
- **Tutorial de primeiro uso (10 etapas).** Abre sozinho na primeira vez (depois de aceitar os termos), escurece a tela e destaca o elemento real
  de cada assunto: saldo, botão **+**, busca e filtros das transações, período dos gráficos, abas Contas/Cartões, aba Investir, Orçamentos/Metas/
  Recorrências, Open Finance e Configurações. Cada etapa diz o que é e **para que serve**, com "Etapa N de 10", **Próximo**, **Voltar**,
  **Pular tutorial** e **Concluir** (que mostra uma mensagem final). Navega sozinho entre as telas, vale para celular e computador, respeita
  "reduzir movimento" e tem teclado (setas, Esc, Tab preso no cartão) e `role="dialog"`. Fica gravado na conta (`profile.onboardingCompleted`, vale
  em qualquer aparelho) e no aparelho (funciona sem rede), então não volta a cada login. Para rever: **Mais → Tutorial do app** ou **Configurações →
  Ajuda**. Contas existentes que nunca concluíram o tutorial o verão uma vez.
- **Temas e personalização** (*Mais → Configurações → Aparência*): Automático, Claro, Escuro, Azul, Roxo, Verde, Vermelho e **Personalizado**
  (cor principal, cor de destaque, fundo e cartões, com prévia ao vivo antes de aplicar e "Restaurar cores padrão"). O app inteiro segue o tema
  (fundos, cartões, menus, botões, bordas, textos, ícones, abas, estados de passar o mouse e selecionado) por *tokens* de cor, sem cor fixa nas
  telas. As cores de um tema personalizado são ajustadas automaticamente para manter o contraste mínimo de leitura (WCAG: texto 4,5, botões e
  destaques 3) e a tela avisa quando uma escolha ficaria difícil de ler. Transição suave ao trocar (desligada com "reduzir movimento").
- **O tema fica na conta:** `PATCH /v1/me` aceita `appearance` (preset + cores, validado pelo mesmo schema Zod do app e limitado a 512 bytes no
  banco) e a escolha volta ao entrar em outro aparelho ou depois de limpar o navegador; no aparelho continua guardada para abrir já com o tema certo.
  Nova coluna `profiles.appearance` (migration `20261005000100_profile_appearance`).
- Estados de passar o mouse (botões, cartões, linhas de lista, chips, abas) e `aria-checked`/`aria-selected`/`aria-pressed` nos controles de seleção.
- **Tela própria de confirmação de e-mail** (`/confirm-email`): o link do e-mail de cadastro agora leva a ela, em vez de cair no Site URL do
  Supabase (que, por padrão, é `localhost:3000`). Mostra "E-mail confirmado!", "Link expirado ou já usado" (com pedido de novo e-mail) ou uma
  orientação quando aberta direto. Tira a sessão (que vem no fragmento da URL) da barra de endereço e **nunca exibe texto vindo da URL**. A API
  passa `redirect_to` ao Supabase a partir de `EMAIL_CONFIRM_REDIRECT_URL` (celular) e `EMAIL_CONFIRM_WEB_REDIRECT_URL` (web), nunca do cliente; o
  cadastro e o reenvio aceitam `platform` (`native`|`web`). Os endereços precisam estar em *Redirect URLs* no Supabase.
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
- **Testes:** 513 automatizados (compartilhado 76, banco 31, app 83, API 323).

### Alterado
- **Diagnóstico agora é só do administrador.** O registro de erros do app, as respostas da API e o endereço do servidor não aparecem mais para
  os demais usuários (a tela volta ao início). O interruptor "Enviar relatórios de erro" continua com todos, agora em *Privacidade e dados*.
- API de administração: a lista traz o nome de exibição e se concluiu o tutorial; o detalhe do usuário **deixou de trazer contagens (contas,
  cartões, lançamentos, metas) e conexões bancárias**; `/stats` ganhou quem concluiu o tutorial e os temas em uso; `/issues` não mostra mais o nome do banco.
- *Configurações → Aparência* deixou de ser um seletor de três opções: virou a tela "Tema do app" (galeria de temas com miniatura, editor do tema
  personalizado e prévia). O antigo claro/escuro/automático continua existindo como os presets Claro, Escuro e Automático, e a escolha antiga é
  mantida na primeira abertura depois da atualização. `profile.theme` segue sendo gravado (Claro/Escuro/Automático), para versões antigas do app.
- Cor de destaque separada da cor principal (`accent`, `accentSoft`, `onAccent`) nos *tokens* de tema; nos temas Claro e Escuro ela é igual à
  principal, então o visual padrão não mudou.
- `pnpm dev:db` e `pnpm dev:api` agora explicam, em português, quando a porta já está em uso (o banco ou a API já
  estão rodando em outro terminal) e como achar o processo, em vez de falhar com `undefined`/`EADDRINUSE`.

- Revogar o Open Finance agora também apaga os investimentos, as fotos diárias e as transações do banco ainda não
  revisadas (as já importadas continuam suas). A exportação de dados (LGPD) inclui os investimentos.
- O widget do Pluggy pede explicitamente `ACCOUNTS`, `CREDIT_CARDS`, `TRANSACTIONS` e `INVESTMENTS`, para o
  consentimento no app do banco cobrir tudo o que o app mostra.

### Segurança
- **Verificação em duas etapas mais firme.** O código passa a ser pedido **toda vez**: em cada login e também ao abrir o app ou recarregar a página (mesmo
  com sessão guardada). **3 códigos errados** (antes eram 5) encerram a sessão e travam as tentativas por 15 minutos, inclusive ao entrar de novo com a
  senha; cada erro mostra quantas tentativas restam e o login explica por que a pessoa foi desconectada. O mesmo limite vale para *Desligar a verificação*.
- **Limite de tentativas contornável pelo `X-Forwarded-For`** (achado de um teste externo, severidade média): a API confiava em todo o cabeçalho,
  inclusive no que o cliente enviava, e quem o trocava ganhava um contador novo (ex.: cadastro). Novo `CLIENT_IP_HEADER` (Render:
  `cf-connecting-ip`; Fly: `fly-client-ip`) usa o IP escrito só pela borda e ignora o `X-Forwarded-For`; sem ele a API avisa ao iniciar em
  produção. Testes cobrem o ataque (controle negativo) e a correção. Veja [docs/seguranca.md](docs/seguranca.md).
- Site: `X-Frame-Options: DENY`, `frame-ancestors 'none'` (CSP), `Referrer-Policy` e `Permissions-Policy` (no `render.yaml`; no painel, aba Headers).
  A CSP completa fica para depois de testar com o widget do Pluggy.

### Corrigido
- **O QR code da verificação em duas etapas vinha quebrado.** A imagem pronta do provedor não escalava direito na tela e o código ficava ilegível. Agora o
  app desenha o QR a partir do endereço `otpauth://`, com a margem exigida e módulos de tamanho inteiro; um teste decodifica o desenho de volta.
- **Em Privacidade, desligar o Open Finance fazia a opção sumir** (não dava para religar). A linha agora fica sempre que o recurso existe: ligar leva à
  tela que mostra o que será compartilhado e pede a autorização; desligar pede confirmação e desconecta os bancos.
- **A logo do fundo agora fica centralizada** (estava no canto), **maior e com bem mais cubos** (grade de 40 por lado, antes 24). No computador **só se
  mexe quando o mouse passa por cima**: os cubos perto do cursor saltam, giram e acendem, e depois voltam ao lugar; parada, não gasta processamento. **No
  celular**, onde não há mouse, os cubos **alternam sozinhos, subindo e descendo** (vizinhos em sentidos opostos, com uma onda lenta atravessando a imagem);
  telas escondidas atrás de outra não animam, para poupar bateria. Quem pediu "reduzir movimento" no aparelho vê a imagem parada.
- **O fundo do ícone da aba ativa cobria o começo do rótulo no computador.** Em telas largas (a partir de 768 px) o React Navigation põe o rótulo ao
  lado do ícone e a pílula encostava na palavra (Início, Transações...). Agora o rótulo fica sempre embaixo do ícone (`tabBarLabelPosition`), como no
  celular, que é o formato para o qual a altura da barra foi calculada. Conferido em 1280 px: 2 px de folga entre a pílula e o texto, nenhum rótulo cortado.
- **Fica claro no log do deploy se há administrador configurado.** A linha "API no ar" agora mostra `admins` (só a quantidade, nunca os IDs) e a situação
  da cobrança, e a API avisa quando `ADMIN_USER_IDS` está vazia (sem ela, o painel do administrador e o Diagnóstico não aparecem para ninguém).
- **Rótulos da barra de abas cortados no celular (de novo).** O fundo arredondado do hover tirou 4 px de altura de cada aba sem que a barra
  crescesse, e o rótulo (Início, Transações...) era espremido e cortado em qualquer largura. Agora as medidas ficam num lugar só
  (`tabBarMetrics.ts`: a altura é a soma de ícone, rótulo, preenchimentos, folga do hover e borda, conferida por teste), o rótulo tem linha fixa e
  não cresce com a fonte do sistema, e os botões usam toda a largura para "Transações" caber inteiro até em telas de 320 px.
- **Destaque de hover "quebrado" nas linhas de lista:** o fundo ao passar o mouse colava no ícone e na seta (sem respiro) e encostava nos
  divisores e nos cantos arredondados do cartão. Agora o destaque é arredondado, passa 8 px do conteúdo para os lados e deixa 8 px de ar em volta
  dentro do cartão (`PressableRow`), igual em Mais, Configurações, Transações, Orçamentos, fatura e folhas de opções. Cartões tocáveis usam borda
  de destaque no hover, sem sombra externa (que listas horizontais recortariam).
- Rótulos da barra de abas (Início, Transações...) ficavam cortados pela metade: a barra tinha 58 px e o ícone, o rótulo e os espaços pedem 59 px
  (na web havia ainda 6 px de respiro embaixo tirados do conteúdo). Agora têm altura suficiente.
- Aviso do *Supabase Advisor* "Function Search Path Mutable" em `app_current_user_id()` e `set_updated_at()`: a migration
  `20261005000200_function_search_path` fixa `search_path = ''` nas duas (elas só usam funções internas do Postgres, que não dependem do `search_path`). Teste novo confere que as políticas de
  RLS continuam funcionando.
- Ícones de erro, de seletor de data e outros cantos do app usavam cinza/branco fixos, que não acompanhariam um tema; passaram a usar os *tokens*.
- Falhas do Supabase Auth eram todas "Serviço de autenticação indisponível", sem pista do motivo. Agora: falha ao enviar e-mail (SMTP) vira
  `502 EMAIL_SEND_FAILED`; o erro genérico passa a levar `details.upstreamStatus`/`upstreamCode` (sem texto livre do Supabase) para o log, e
  "sem resposta" (rede, tempo esgotado) é `upstreamCode: network_error`. O guia diz onde olhar (Supabase → Logs → Auth).
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
