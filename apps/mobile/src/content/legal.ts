// Documentos legais exibidos no app (versão 2026-10-07: deve acompanhar LEGAL_*_VERSION da API e LEGAL_VERSION do app).
//
// ATENÇÃO: são MODELOS de boa-fé, escritos para uma operação pequena e conferidos contra o que o software realmente faz. Antes de ligar a
// cobrança e de publicar nas lojas, passe por revisão jurídica (advogado(a)) e preencha os dados da empresa (app.config.ts → extra.company).
// Ao mudar o texto de forma relevante, mude a versão (LEGAL_*_VERSION): o app pede um novo aceite de todo mundo.

import { COMPANY, type Company } from "./company";
import { SUPPORT } from "./contact";

export { COMPANY };

/** "Finança, CNPJ 00.000.000/0001-00, com sede em Cidade/UF", sem os pedaços que ainda não foram preenchidos. */
export function controllerLine(c: Pick<Company, "name" | "cnpj" | "city"> = COMPANY): string {
  const parts = [c.name];
  if (c.cnpj) parts.push(`CNPJ ${c.cnpj}`);
  if (c.city) parts.push(`com sede em ${c.city}`);
  return parts.join(", ");
}

export const LEGAL_VERSION_LABEL = "2026-10-07";

export type LegalBlock =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "note"; tone: "info" | "warning"; text: string };

export type LegalSection = { id: string; icon: string; heading: string; blocks: LegalBlock[] };
export type LegalHighlight = { icon: string; title: string; text: string };
export type LegalLaw = { name: string; ref: string; about: string };

export type LegalDoc = {
  key: "terms" | "privacy";
  title: string;
  icon: string;
  tone: "primary" | "slate" | "violet";
  updatedAt: string;
  version: string;
  intro: string;
  /** "Em resumo": as ideias principais em frases curtas. */
  highlights: LegalHighlight[];
  /** Leis que o documento cita (aparecem como etiquetas e na lista "Leis que seguimos"). */
  laws: LegalLaw[];
  sections: LegalSection[];
};

const p = (text: string): LegalBlock => ({ kind: "p", text });
const list = (...items: string[]): LegalBlock => ({ kind: "list", items });
const table = (head: string[], ...rows: string[][]): LegalBlock => ({ kind: "table", head, rows });
const note = (text: string, tone: "info" | "warning" = "info"): LegalBlock => ({ kind: "note", tone, text });

/** Leis e normas citadas nos dois documentos. */
export const LAWS = {
  lgpd: { name: "LGPD", ref: "Lei nº 13.709/2018", about: "Lei Geral de Proteção de Dados Pessoais: como dados pessoais podem ser tratados e quais são os seus direitos." },
  marcoCivil: { name: "Marco Civil da Internet", ref: "Lei nº 12.965/2014", about: "Direitos e deveres no uso da internet, incluindo sigilo e a guarda de registros de acesso." },
  cdc: { name: "Código de Defesa do Consumidor", ref: "Lei nº 8.078/1990", about: "Direitos do consumidor: informação clara, proteção contra cláusulas abusivas e direito de arrependimento." },
  ecommerce: { name: "Decreto do Comércio Eletrônico", ref: "Decreto nº 7.962/2013", about: "Regras para contratar pela internet: informações claras, atendimento facilitado e arrependimento." },
  openFinance: { name: "Open Finance", ref: "Resolução Conjunta nº 1/2020 (CMN e Banco Central)", about: "Regulamento do compartilhamento padronizado de dados e serviços financeiros, sempre com o consentimento do cliente." },
  software: { name: "Lei do Software", ref: "Lei nº 9.609/1998", about: "Proteção da propriedade intelectual de programas de computador." },
  autoral: { name: "Lei de Direitos Autorais", ref: "Lei nº 9.610/1998", about: "Proteção de textos, imagens, marcas visuais e demais criações." },
  penal: { name: "Código Penal, art. 154-A", ref: "incluído pela Lei nº 12.737/2012", about: "Invadir dispositivo informático alheio para obter, adulterar ou destruir dados é crime." },
  eca: { name: "Estatuto da Criança e do Adolescente", ref: "Lei nº 8.069/1990", about: "Proteção integral de crianças e adolescentes, inclusive no ambiente digital." },
} satisfies Record<string, LegalLaw>;

// =============================================================================================================================
// POLÍTICA DE PRIVACIDADE
// =============================================================================================================================

export const PRIVACY_POLICY: LegalDoc = {
  key: "privacy",
  title: "Política de Privacidade",
  icon: "shield-check",
  tone: "primary",
  updatedAt: "7 de outubro de 2026",
  version: LEGAL_VERSION_LABEL,
  intro: `Aqui explicamos, sem enrolação, quais dados do Finança tratamos, por que, por quanto tempo, com quem dividimos e como você manda em tudo isso. Seguimos a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018) e as demais leis brasileiras que valem para um aplicativo como este.`,
  highlights: [
    { icon: "ban", title: "Não vendemos seus dados", text: "Nem usamos para publicidade de terceiros. Seus lançamentos servem só para o app funcionar para você." },
    { icon: "lock", title: "Nunca vemos suas senhas", text: "A senha do Finança fica com o provedor de login e as senhas de banco nunca são pedidas." },
    { icon: "download", title: "Seus dados, sua decisão", text: "Exporte tudo em um arquivo ou exclua a conta em poucos toques, a qualquer momento." },
    { icon: "eye-off", title: "A equipe não vê seu dinheiro", text: "O painel de administração mostra só dados de cadastro, nunca saldos, contas, cartões ou lançamentos." },
  ],
  laws: [LAWS.lgpd, LAWS.marcoCivil, LAWS.cdc, LAWS.ecommerce, LAWS.openFinance, LAWS.eca],
  sections: [
    {
      id: "quem-somos",
      icon: "building",
      heading: "1. Quem é o controlador e como falar com a gente",
      blocks: [
        p(`O controlador dos seus dados pessoais é ${controllerLine()}. Controlador é quem decide como e por que os dados são tratados (LGPD, art. 5º, VI).`),
        p("O canal do Encarregado pelo tratamento de dados pessoais (o “DPO”, art. 41 da LGPD) e do suporte é o mesmo:"),
        list(`E-mail: ${COMPANY.dpoEmail}`, `WhatsApp: ${SUPPORT.whatsappDisplay}`),
        note("Pelo WhatsApp e pelo e-mail NUNCA pedimos senhas, o código do autenticador nem o número completo do cartão. Desconfie de qualquer mensagem que peça isso.", "warning"),
      ],
    },
    {
      id: "leis",
      icon: "scale",
      heading: "2. Em quais leis nos baseamos",
      blocks: [
        list(
          "LGPD (Lei nº 13.709/2018): regula todo o tratamento de dados pessoais descrito aqui.",
          "Marco Civil da Internet (Lei nº 12.965/2014): sigilo das comunicações, não fornecimento de dados a terceiros sem consentimento ou ordem judicial, e a guarda de registros de acesso (art. 15), quando aplicável.",
          "Código de Defesa do Consumidor (Lei nº 8.078/1990) e Decreto nº 7.962/2013: informação clara sobre o serviço, preço e cancelamento quando houver assinatura.",
          "Open Finance (Resolução Conjunta nº 1/2020 do CMN e do Banco Central): só no recurso opcional de conexão com bancos, quando estiver disponível.",
          "Estatuto da Criança e do Adolescente (Lei nº 8.069/1990) e art. 14 da LGPD: o app é para maiores de 18 anos.",
        ),
      ],
    },
    {
      id: "dados",
      icon: "database",
      heading: "3. Quais dados coletamos",
      blocks: [
        table(
          ["Dado", "O que é", "De onde vem"],
          ["Conta", "E-mail, nome (opcional) e preferências do app (tema, fuso horário, avisos).", "Você, no cadastro e em Minha conta; ou o provedor de login social (nome e e-mail verificado)."],
          ["Senha", "Nunca chega ao nosso banco: fica protegida (hash) no provedor de login.", "Você, direto ao provedor."],
          ["Dados financeiros", "Contas, saldos iniciais, receitas, despesas, transferências, categorias, orçamentos, metas, recorrências e, nos cartões, só o apelido, o limite, os dias de fechamento e vencimento e os 4 últimos dígitos.", "Você. Nunca pedimos número completo, validade nem CVV."],
          ["Aceites e consentimentos", "Qual documento você aceitou, em qual versão e quando (e as escolhas de marketing e de Open Finance).", "Você, ao aceitar."],
          ["Segurança da conta", "Se a verificação em duas etapas está ligada e o identificador do fator. O segredo do código fica só no provedor de login.", "Você, ao ativar."],
          ["Assinatura e pagamento", "Situação do plano, datas, adicionais contratados e identificadores no provedor de pagamento. Os dados do cartão ficam só com o provedor de pagamento.", "Você e o provedor de pagamento."],
          ["Dados técnicos", "Identificador de notificação do aparelho, plataforma, versão do app, relatórios de erro (podem ser desligados em Privacidade e dados) e registros de segurança. O IP é guardado apenas como hash irreversível.", "O seu aparelho."],
          ["Mensagens ao suporte", "O que você nos escreve por e-mail ou WhatsApp, e o número/e-mail de onde veio.", "Você."],
          ["Open Finance (opcional)", "Com o seu consentimento: saldos e transações das suas contas, limite, fatura e vencimento dos cartões e aplicações financeiras (valores e rendimento).", "O parceiro regulado de Open Finance, depois de você autorizar no ambiente oficial do seu banco."],
        ),
        note("O que NÃO coletamos: senhas de banco, número completo/validade/CVV de cartão, localização, contatos, câmera, microfone nem identificadores de publicidade. Não há rastreadores de publicidade nem de análise de terceiros no app."),
      ],
    },
    {
      id: "finalidades",
      icon: "target",
      heading: "4. Para que usamos e em qual base legal",
      blocks: [
        p("Cada uso precisa de uma base legal do art. 7º da LGPD. Estas são as nossas:"),
        table(
          ["Finalidade", "Base legal (LGPD)"],
          ["Criar e manter a sua conta; calcular saldos, gráficos, orçamentos, metas e alertas; sincronizar entre aparelhos.", "Execução de contrato (art. 7º, V)."],
          ["Cobrar a assinatura, emitir comprovantes e cumprir obrigações fiscais e contábeis.", "Execução de contrato (art. 7º, V) e cumprimento de obrigação legal (art. 7º, II)."],
          ["Conexão com bancos (Open Finance), mensagens de marketing e notificações opcionais.", "Consentimento (art. 7º, I). Você retira quando quiser, no app."],
          ["Segurança da conta, verificação em duas etapas, prevenção a fraudes e abusos, registros de auditoria.", "Legítimo interesse (art. 7º, IX), com o mínimo de dados e respeitando seus direitos; e obrigação legal quando houver."],
          ["Atender pedidos seus (suporte, exercício de direitos) e nos defender em processos.", "Execução de contrato; exercício regular de direitos (art. 7º, VI)."],
        ),
        p("Não tomamos decisões automatizadas que gerem efeitos jurídicos sobre você. Os insights do app (por exemplo, “você gastou mais com mercado este mês”) são apenas informativos."),
      ],
    },
    {
      id: "principios",
      icon: "list-checks",
      heading: "5. Os princípios que seguimos (art. 6º da LGPD)",
      blocks: [
        list(
          "Finalidade e adequação: só usamos os dados para o que está escrito aqui.",
          "Necessidade: coletamos o mínimo (por isso nunca pedimos número completo de cartão).",
          "Livre acesso e qualidade dos dados: você vê e corrige o que registrou, a qualquer hora.",
          "Transparência: esta política e o painel “Minha conta” mostram o que sabemos sobre você.",
          "Segurança e prevenção: protegemos os dados e evitamos danos antes que aconteçam.",
          "Não discriminação: não usamos seus dados para tratá-lo de forma ilícita ou abusiva.",
          "Responsabilização: registramos o que é sensível (auditoria) para poder provar que cumprimos a lei.",
        ),
      ],
    },
    {
      id: "login-social",
      icon: "key-round",
      heading: "6. Entrar com Google, Facebook e outras contas",
      blocks: [
        p("Você pode criar a conta e entrar usando Google, Facebook, Apple, Microsoft e outros provedores que aparecerem no app. O Instagram não tem login próprio para aplicativos de terceiros: quem usa o Instagram entra pelo Facebook (Meta)."),
        list(
          "Recebemos do provedor apenas o necessário: o seu nome e o e-mail verificado. Não recebemos a senha da sua rede social nem acesso às suas publicações, contatos ou mensagens.",
          "O provedor trata os seus dados conforme a política dele. Ao tocar no botão, você é levado à página dele para autorizar.",
          "Você pode ligar o seu e-mail e senha à mesma conta, e quem entra só por rede social pode definir uma senha em Minha conta.",
        ),
      ],
    },
    {
      id: "duas-etapas",
      icon: "smartphone",
      heading: "7. Verificação em duas etapas",
      blocks: [
        p("É opcional e recomendada. Usa um aplicativo autenticador (como Google Authenticator ou Microsoft Authenticator) que gera um código de 6 números a cada 30 segundos. O segredo que gera o código fica apenas no provedor de login; no nosso banco ficam só a informação de que está ligada e o identificador do fator."),
        p("Se você perder o aparelho, fale com o suporte: depois de confirmarmos que a conta é sua, desligamos a verificação para você entrar de novo com a senha. Cada pedido desses fica na nossa auditoria."),
      ],
    },
    {
      id: "pagamentos",
      icon: "credit-card",
      heading: "8. Assinatura e pagamentos",
      blocks: [
        p("Quando a cobrança estiver ativa, o pagamento é feito na página segura de um provedor de pagamento terceirizado. Os dados do seu cartão (ou Pix) são tratados por ele e nunca passam pelos nossos servidores nem ficam no nosso banco."),
        p("Guardamos apenas o que precisamos para liberar o acesso e prestar contas: o plano e o período contratados, a situação do pagamento, os adicionais e os identificadores do cliente e da assinatura no provedor. Dados fiscais e contábeis são mantidos pelo prazo exigido pela legislação."),
      ],
    },
    {
      id: "compartilhamento",
      icon: "share-2",
      heading: "9. Com quem compartilhamos",
      blocks: [
        p("Só compartilhamos dados com operadores que nos prestam serviço e seguem as nossas instruções, ou quando a lei exige:"),
        table(
          ["Quem", "Para quê", "Quais dados"],
          ["Hospedagem, banco de dados e autenticação", "Rodar o app, guardar os dados e fazer o login.", "Todos os dados do app, criptografados em trânsito."],
          ["Provedor de pagamento", "Cobrar a assinatura.", "E-mail, plano e dados do pagamento que você digita lá."],
          ["Provedor de login social", "Entrar com Google, Facebook etc.", "O necessário para o login (identificador e e-mail)."],
          ["Envio de e-mails e notificações push", "Confirmar o e-mail, redefinir a senha e avisar vencimentos.", "E-mail ou identificador do aparelho, e o texto do aviso."],
          ["Parceiro de Open Finance (se você ativar)", "Ler os dados do seu banco com o seu consentimento.", "O que você autorizar compartilhar."],
          ["Autoridades", "Cumprir lei ou ordem de autoridade competente.", "O mínimo exigido."],
        ),
        p("A equipe do Finança que administra o app só vê dados de cadastro (nome, e-mail, plano e situação) e números agregados. Os saldos, lançamentos, contas, cartões e conexões bancárias de cada pessoa não aparecem no painel de administração, e todo acesso a dados de cadastro fica registrado."),
      ],
    },
    {
      id: "internacional",
      icon: "globe",
      heading: "10. Onde os dados ficam e transferência internacional",
      blocks: [
        p("Nossa infraestrutura principal fica no Brasil (região de São Paulo). Alguns operadores, como o de notificações push, de e-mail ou de pagamento, podem tratar dados mínimos fora do país. Nesses casos adotamos as salvaguardas do art. 33 da LGPD, como cláusulas contratuais padrão e a escolha de empresas com programas de proteção de dados reconhecidos."),
      ],
    },
    {
      id: "prazos",
      icon: "clock",
      heading: "11. Por quanto tempo guardamos",
      blocks: [
        table(
          ["Dado", "Prazo"],
          ["Conta e dados financeiros", "Enquanto a conta existir. Ao excluir, são apagados do banco principal logo em seguida e das cópias de segurança em até 7 dias."],
          ["Registros de auditoria e de segurança", "Até 6 meses (lembrando o art. 15 do Marco Civil da Internet, quando aplicável). O IP só existe como hash."],
          ["Eventos de pagamento e de integração", "30 dias."],
          ["Histórico de trocas de nome, e-mail e senha (só o tipo e a data, nunca o valor)", "Até 400 dias, para aplicar os limites por mês e por ano."],
          ["Chaves técnicas temporárias (idempotência)", "48 horas."],
          ["Notificações lidas", "90 dias."],
          ["Dados fiscais e contábeis da assinatura", "O prazo exigido pela legislação."],
          ["Registros de consentimento", "O necessário para comprovar o cumprimento da lei, sem dados financeiros."],
          ["Mensagens ao suporte", "Enquanto forem necessárias para o atendimento e para cumprir obrigações legais."],
          ["Registro de erros no seu aparelho", "Últimos 300 eventos; some ao desinstalar o app ou quando você apaga."],
        ),
      ],
    },
    {
      id: "direitos",
      icon: "hand-heart",
      heading: "12. Seus direitos (art. 18 da LGPD) e como exercê-los",
      blocks: [
        table(
          ["Direito", "Como exercer no app"],
          ["Confirmar que tratamos seus dados e acessá-los", "Configurações → Minha conta."],
          ["Portabilidade e cópia", "Configurações → Privacidade e dados → Exportar meus dados (arquivo completo)."],
          ["Corrigir dados", "Você edita tudo no app; nome, e-mail e senha em Minha conta (com limites por mês e por ano, para evitar abusos)."],
          ["Anonimização, bloqueio ou eliminação", "Configurações → Privacidade e dados → Excluir minha conta (definitivo)."],
          ["Saber com quem compartilhamos", "Seção 9 desta política."],
          ["Retirar o consentimento", "Configurações → Privacidade e dados (marketing e Open Finance)."],
          ["Se opor a um tratamento e pedir revisão", `Fale com o Encarregado: ${COMPANY.dpoEmail}.`],
        ),
        p("Pelo app, você exerce a maioria desses direitos na hora. Para pedidos por e-mail ou WhatsApp, respondemos imediatamente quando possível, ou com uma declaração completa em até 15 dias (LGPD, art. 19)."),
        p("Se achar que não resolvemos, você pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD, www.gov.br/anpd), a um órgão de defesa do consumidor ou à Justiça."),
      ],
    },
    {
      id: "seguranca",
      icon: "shield",
      heading: "13. Como protegemos seus dados",
      blocks: [
        list(
          "Conexão criptografada (HTTPS) em todo o tráfego.",
          "Isolamento dos dados de cada usuário no banco de dados em várias camadas: mesmo que um filtro falhe, o banco só entrega a você o que é seu.",
          "Verificação em duas etapas opcional e login por provedores confiáveis; senhas nunca ficam no nosso banco.",
          "Limites de tentativas de login e de código, e bloqueio temporário contra tentativas repetidas.",
          "Registros sem dados sensíveis, IP guardado só como hash e auditoria de toda ação administrativa.",
          "Bloqueio opcional do aplicativo por biometria no seu aparelho.",
        ),
        note("Nenhum sistema é totalmente imune a incidentes. Se ocorrer um que possa causar risco ou dano relevante, comunicaremos você e a ANPD, nos termos do art. 48 da LGPD e do regulamento da ANPD."),
      ],
    },
    {
      id: "criancas",
      icon: "baby",
      heading: "14. Crianças e adolescentes",
      blocks: [p("O Finança é destinado a maiores de 18 anos. Não coletamos dados de menores de propósito. Se descobrirmos uma conta de menor, vamos encerrá-la e apagar os dados (LGPD, art. 14, e Estatuto da Criança e do Adolescente).")],
    },
    {
      id: "navegador",
      icon: "globe",
      heading: "15. Versão web: armazenamento no navegador",
      blocks: [p("Na versão para navegador usamos o armazenamento local do próprio navegador para manter a sua sessão e as suas preferências (tema, ocultar valores, tutorial). Não usamos cookies de publicidade nem de análise de terceiros. Ao sair da conta, esses dados locais são apagados.")],
    },
    {
      id: "mudancas",
      icon: "refresh-cw",
      heading: "16. Mudanças nesta política",
      blocks: [p("Podemos atualizar esta política. Em mudanças relevantes (por exemplo, um novo tipo de dado ou um novo operador), avisamos no app e pedimos um novo aceite antes de você continuar. A versão em vigor aparece no topo desta página e em Configurações → Privacidade e dados.")],
    },
  ],
};

// =============================================================================================================================
// TERMOS DE USO
// =============================================================================================================================

export const TERMS_OF_USE: LegalDoc = {
  key: "terms",
  title: "Termos de Uso",
  icon: "file-text",
  tone: "violet",
  updatedAt: "7 de outubro de 2026",
  version: LEGAL_VERSION_LABEL,
  intro: `Estes Termos são o combinado entre você e ${controllerLine()} sobre o uso do aplicativo Finança. Ao criar uma conta ou entrar, você declara que leu e concorda com eles e com a Política de Privacidade.`,
  highlights: [
    { icon: "gift", title: "30 dias grátis, sem cartão", text: "Teste tudo por 30 dias. Depois, para criar e editar, é preciso assinar." },
    { icon: "eye", title: "Seus dados não ficam presos", text: "Sem assinatura o app vira somente leitura: você vê tudo e exporta quando quiser. Nada é apagado." },
    { icon: "undo-2", title: "Cancele quando quiser", text: "Sem multa. O acesso segue até o fim do período já pago. Arrependimento em 7 dias, como manda o CDC." },
    { icon: "badge-info", title: "Ferramenta, não consultoria", text: "O Finança organiza o seu dinheiro. Não movimenta valores nem recomenda investimentos." },
  ],
  laws: [LAWS.cdc, LAWS.ecommerce, LAWS.lgpd, LAWS.marcoCivil, LAWS.software, LAWS.autoral, LAWS.penal, LAWS.openFinance],
  sections: [
    {
      id: "o-que-e",
      icon: "sparkles",
      heading: "1. O que é o Finança (e o que não é)",
      blocks: [
        p("O Finança é uma ferramenta de organização financeira pessoal: registra receitas e despesas, acompanha contas e cartões, cria orçamentos e metas, mostra gráficos e, em recursos opcionais, acompanha rendimentos e conecta bancos."),
        note("Não somos instituição financeira, não movimentamos o seu dinheiro, não oferecemos crédito e não prestamos consultoria, análise ou recomendação de investimentos. Os insights e os cálculos são informativos e dependem dos dados que você registra.", "warning"),
      ],
    },
    {
      id: "conta",
      icon: "user",
      heading: "2. Sua conta",
      blocks: [
        list(
          "Você precisa ter 18 anos ou mais e informar dados verdadeiros. Uma conta é de uma pessoa só.",
          "Você pode entrar com e-mail e senha ou com Google, Facebook e outros provedores que o app oferecer.",
          "Você é responsável por manter as suas credenciais em sigilo e por tudo o que acontece na conta. Recomendamos ligar a verificação em duas etapas.",
          "Avise-nos na hora se suspeitar de uso indevido. Podemos suspender contas que violem estes Termos, ameacem a segurança do serviço ou sejam usadas para fraude.",
          "Nome, e-mail e senha podem ser trocados em Minha conta, com limites por mês e por ano para evitar abusos.",
        ),
      ],
    },
    {
      id: "planos",
      icon: "crown",
      heading: "3. Teste grátis, planos e pagamento",
      blocks: [
        table(
          ["Fase", "O que acontece"],
          ["Teste grátis", "30 dias com tudo liberado, sem cartão. Quem já usava o app antes da cobrança começa o teste na data de início da cobrança."],
          ["Assinatura", "Plano mensal ou anual (e adicionais opcionais, como o Rendimentos), com renovação automática até você cancelar."],
          ["Sem assinatura", "Depois do teste, o app fica somente leitura: você consulta e exporta tudo, mas não cria nem edita nada até assinar."],
        ),
        list(
          "Mostramos o preço, o período e as condições antes de você contratar (CDC, art. 6º, III, e Decreto nº 7.962/2013). Os valores vêm do provedor de pagamento e aparecem na tela de assinatura.",
          "O pagamento é feito na página segura do provedor de pagamento; o Finança nunca vê nem guarda os dados do seu cartão.",
          "Cartão recusado não derruba o acesso no meio do período já pago. Se o pagamento não se resolver, o acesso volta a ser somente leitura.",
          "Mudança de preço vale só para renovações futuras, com aviso, e nunca altera um período já pago.",
          "Podemos conceder acesso gratuito por tempo determinado ou indeterminado (cortesia) e retirá-lo, sem direito a compensação.",
        ),
      ],
    },
    {
      id: "cancelamento",
      icon: "undo-2",
      heading: "4. Cancelamento e arrependimento",
      blocks: [
        list(
          "Você cancela quando quiser, pela página de gerenciamento da assinatura (Assinatura → Gerenciar assinatura). Não há multa. O cancelamento impede novas cobranças e o acesso continua até o fim do período já pago.",
          "Como a contratação é feita pela internet, você tem o direito de arrependimento em até 7 dias a contar da contratação, com devolução do valor pago (CDC, art. 49, e Decreto nº 7.962/2013, art. 5º). Peça pelo suporte.",
          "Excluir a conta cancela a assinatura automaticamente.",
        ),
        p("Fora desses casos, pedidos de reembolso são analisados pelo suporte, sem prejuízo dos seus direitos legais."),
      ],
    },
    {
      id: "uso",
      icon: "shield-alert",
      heading: "5. Uso permitido e proibido",
      blocks: [
        p("É proibido: tentar acessar dados de outras pessoas; burlar limites, bloqueios e mecanismos de segurança; fazer engenharia reversa ou copiar o serviço; usá-lo para atividades ilegais; ou sobrecarregar os sistemas."),
        note("Invadir dispositivo informático ou sistema alheio para obter dados pode configurar crime (Código Penal, art. 154-A). Vamos cooperar com as autoridades quando necessário.", "warning"),
      ],
    },
    {
      id: "propriedade",
      icon: "copyright",
      heading: "6. Propriedade intelectual",
      blocks: [
        p("O aplicativo, a marca, o design e os textos são protegidos pela Lei do Software (Lei nº 9.609/1998) e pela Lei de Direitos Autorais (Lei nº 9.610/1998). Você recebe uma licença pessoal, limitada, revogável e não exclusiva para usar o app."),
        p("Os dados que você registra continuam sendo seus. Você nos autoriza apenas a tratá-los para prestar o serviço, conforme a Política de Privacidade."),
      ],
    },
    {
      id: "privacidade",
      icon: "lock",
      heading: "7. Seus dados e sua privacidade",
      blocks: [p("O tratamento de dados pessoais segue a Política de Privacidade e a LGPD. Você pode exportar todos os seus dados e excluir a conta a qualquer momento em Configurações → Privacidade e dados. A exclusão é definitiva.")],
    },
    {
      id: "open-finance",
      icon: "link",
      heading: "8. Conexão com bancos (Open Finance)",
      blocks: [
        p("É um recurso opcional que ainda pode não estar disponível para todos. Quando estiver, ele usa o ecossistema regulado do Open Finance Brasil (Resolução Conjunta nº 1/2020 do CMN e do Banco Central), por meio de um parceiro autorizado."),
        list(
          "Você escolhe quais instituições e dados compartilhar e por quanto tempo, e pode revogar a qualquer momento, no app ou na sua instituição.",
          "Nunca pedimos a sua senha bancária: a autorização é feita no ambiente oficial do seu banco. O acesso é somente de leitura.",
          "Ao encerrar a conexão, pedimos o fim do acesso ao parceiro e apagamos as aplicações e os dados brutos ainda não aproveitados; os lançamentos que você já incorporou continuam sob o seu controle.",
        ),
      ],
    },
    {
      id: "rendimentos",
      icon: "piggy-bank",
      heading: "9. Rendimentos e investimentos",
      blocks: [
        p("Recursos que acompanham rendimentos (como CDI, CDB e o “porquinho”) trabalham com estimativas, calculadas com as taxas oficiais divulgadas e com os dados que você informa. O valor real pode diferir por arredondamentos, impostos, datas de crédito e regras da instituição. Confira sempre o extrato do banco."),
        p("Nada no app é recomendação de investimento."),
      ],
    },
    {
      id: "disponibilidade",
      icon: "wifi",
      heading: "10. Disponibilidade, atualizações e suporte",
      blocks: [
        p("Trabalhamos para manter o serviço disponível e seguro, mas não garantimos funcionamento ininterrupto ou livre de erros. Podemos fazer manutenções e atualizações, e recursos podem mudar ou ser descontinuados, com aviso quando houver impacto relevante."),
        p(`Suporte: ${COMPANY.supportEmail} ou WhatsApp ${SUPPORT.whatsappDisplay}.`),
      ],
    },
    {
      id: "responsabilidade",
      icon: "scale",
      heading: "11. Responsabilidade",
      blocks: [
        p("Na medida permitida pela lei, não respondemos por perdas decorrentes de decisões tomadas com base nas informações do app, por dados registrados de forma incorreta por você ou por falhas de terceiros (bancos, lojas de aplicativos, provedores de pagamento e de internet)."),
        note("Nada nestes Termos afasta ou limita os direitos assegurados a você pelo Código de Defesa do Consumidor; cláusulas que fossem abusivas são nulas (CDC, art. 51)."),
      ],
    },
    {
      id: "encerramento",
      icon: "log-out",
      heading: "12. Encerramento",
      blocks: [
        p("Você pode excluir a sua conta quando quiser. Nós podemos encerrar ou suspender contas que violem estes Termos, com aviso quando possível. Ao encerrar, os dados são tratados conforme a Política de Privacidade."),
      ],
    },
    {
      id: "alteracoes",
      icon: "refresh-cw",
      heading: "13. Alterações nestes Termos",
      blocks: [p("Podemos alterar estes Termos. Em mudanças relevantes, avisamos no app e pedimos um novo aceite antes de você continuar usando. A versão em vigor aparece no topo desta página.")],
    },
    {
      id: "lei-foro",
      icon: "landmark",
      heading: "14. Lei aplicável, foro e solução de conflitos",
      blocks: [
        p("Aplica-se a legislação brasileira. Antes de qualquer processo, procure o suporte: queremos resolver. Você também pode recorrer ao consumidor.gov.br ou a um órgão de defesa do consumidor."),
        p("Fica eleito o foro do domicílio do consumidor para resolver eventuais controvérsias (CDC, art. 101, I)."),
      ],
    },
  ],
};

export const LEGAL_DOCS = { terms: TERMS_OF_USE, privacy: PRIVACY_POLICY } as const;
export type LegalDocKey = keyof typeof LEGAL_DOCS;
