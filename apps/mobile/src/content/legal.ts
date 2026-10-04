// Documentos legais exibidos no app (versão 2026-10-01 — deve acompanhar LEGAL_*_VERSION da API).
//
// ATENÇÃO: são MODELOS de boa-fé, escritos para uma operação pequena. Antes de publicar nas lojas,
// preencha os dados da empresa (app.config.ts → extra.company) e passe por revisão jurídica.

import Constants from "expo-constants";

type Company = { name: string; cnpj: string; dpoEmail: string; supportEmail: string; city: string };

const extra = (Constants.expoConfig?.extra ?? {}) as { company?: Partial<Company> };
export const COMPANY: Company = {
  name: extra.company?.name ?? "[NOME DA EMPRESA]",
  cnpj: extra.company?.cnpj ?? "[CNPJ]",
  dpoEmail: extra.company?.dpoEmail ?? "[E-MAIL DO ENCARREGADO]",
  supportEmail: extra.company?.supportEmail ?? "[E-MAIL DE SUPORTE]",
  city: extra.company?.city ?? "[CIDADE/UF]",
};

export type LegalSection = { heading: string; paragraphs: string[] };
export type LegalDoc = { title: string; updatedAt: string; intro?: string; sections: LegalSection[] };

export const PRIVACY_POLICY: LegalDoc = {
  title: "Política de Privacidade",
  updatedAt: "1º de outubro de 2026",
  intro: `Esta política explica como ${COMPANY.name} ("nós") trata os seus dados pessoais no aplicativo Finança, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).`,
  sections: [
    {
      heading: "1. Quem é o controlador",
      paragraphs: [
        `O controlador dos dados é ${COMPANY.name}, CNPJ ${COMPANY.cnpj}, com sede em ${COMPANY.city}.`,
        `O Encarregado pelo tratamento de dados pessoais (DPO) pode ser contatado em ${COMPANY.dpoEmail}.`,
      ],
    },
    {
      heading: "2. Quais dados coletamos",
      paragraphs: [
        "Dados da conta: e-mail, nome (opcional) e preferências do aplicativo. A sua senha é guardada exclusivamente pelo provedor de autenticação, em formato protegido (hash); nós nunca temos acesso a ela.",
        "Dados financeiros que VOCÊ informa: contas, saldos iniciais, lançamentos (receitas, despesas e transferências), categorias, cartões (apenas apelido, limite, dias de fechamento/vencimento e os 4 últimos dígitos — nunca o número completo, validade ou CVV), orçamentos, metas e recorrências.",
        "Dados técnicos: identificador de notificação push do aparelho, plataforma (iOS/Android), versão do aplicativo e registros de segurança (por exemplo, tentativas de acesso). Endereços IP são guardados apenas em forma de hash irreversível.",
        "Registros de consentimento: qual documento você aceitou, em qual versão e quando.",
        "Open Finance (somente se você ativar este recurso opcional): com o seu consentimento, recebemos de um parceiro regulado os saldos e as transações das suas contas, o limite, a fatura e o vencimento dos seus cartões de crédito e as suas aplicações financeiras (como CDB, caixinhas, cofrinhos, LCI/LCA e fundos, com valores e rendimento). O login no banco acontece no ambiente oficial da sua instituição financeira; NÓS NUNCA SOLICITAMOS NEM ARMAZENAMOS SUAS SENHAS BANCÁRIAS.",
      ],
    },
    {
      heading: "3. Para que usamos e em que base legal",
      paragraphs: [
        "Prestar o serviço (art. 7º, V da LGPD — execução de contrato): criar sua conta, calcular saldos, gráficos, orçamentos, metas e alertas, e sincronizar seus dados entre aparelhos.",
        "Consentimento (art. 7º, I): conexão com bancos via Open Finance, comunicações de marketing e notificações opcionais. Você pode retirar o consentimento a qualquer momento no aplicativo.",
        "Obrigação legal (art. 7º, II): guarda de registros de acesso quando exigido por lei.",
        "Legítimo interesse (art. 7º, IX): segurança, prevenção a fraudes e melhoria do serviço, sempre com o mínimo de dados necessário e respeitando os seus direitos.",
        "Não vendemos seus dados e não os usamos para publicidade de terceiros.",
      ],
    },
    {
      heading: "4. Com quem compartilhamos",
      paragraphs: [
        "Compartilhamos dados somente com operadores que nos prestam serviços e seguem as nossas instruções: hospedagem da aplicação e do banco de dados, autenticação de usuários, envio de notificações push, envio de e-mails transacionais e, se você ativar, o parceiro regulado de Open Finance.",
        "Também podemos compartilhar dados quando exigido por lei ou ordem de autoridade competente.",
      ],
    },
    {
      heading: "5. Onde os dados ficam",
      paragraphs: [
        "Nossa infraestrutura principal fica no Brasil (região de São Paulo). Alguns operadores, como o serviço de notificações push, podem tratar dados mínimos fora do país; nesses casos adotamos as salvaguardas do art. 33 da LGPD.",
      ],
    },
    {
      heading: "6. Por quanto tempo guardamos",
      paragraphs: [
        "Dados da conta e dados financeiros: enquanto a sua conta existir. Ao excluir a conta, eles são apagados em até 15 dias.",
        "Cópias de segurança (backups): ficam por até 7 dias após a exclusão e depois são descartadas.",
        "Registros de auditoria e segurança: até 6 meses. Dados técnicos temporários (chaves de idempotência, eventos de integração): de 2 a 30 dias.",
        "Registros de consentimento podem ser mantidos pelo prazo necessário para comprovar o cumprimento da lei.",
      ],
    },
    {
      heading: "7. Seus direitos (art. 18 da LGPD)",
      paragraphs: [
        "Você pode, a qualquer momento: confirmar a existência de tratamento; acessar seus dados; corrigi-los; pedir a anonimização, bloqueio ou eliminação de dados desnecessários; solicitar a portabilidade; saber com quem compartilhamos; retirar o consentimento; e se opor a tratamentos.",
        "No aplicativo, em Configurações → Privacidade e dados, você pode exportar todos os seus dados em formato JSON, gerenciar consentimentos e excluir a conta definitivamente.",
        `Para qualquer outra solicitação, escreva para ${COMPANY.dpoEmail}. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).`,
      ],
    },
    {
      heading: "8. Como protegemos seus dados",
      paragraphs: [
        "Conexões criptografadas (HTTPS), isolamento rigoroso dos dados de cada usuário no banco de dados, controle de acesso por perfil, limites de tentativas, registros sem dados sensíveis e bloqueio opcional do aplicativo por biometria.",
        "Nenhum sistema é totalmente imune a incidentes. Se ocorrer um incidente que possa causar risco relevante, comunicaremos você e a ANPD, conforme a lei.",
      ],
    },
    {
      heading: "9. Crianças e adolescentes",
      paragraphs: ["O aplicativo é destinado a maiores de 18 anos. Não coletamos intencionalmente dados de menores."],
    },
    {
      heading: "10. Mudanças nesta política",
      paragraphs: ["Podemos atualizar esta política. Em mudanças relevantes, pediremos um novo aceite no aplicativo antes de você continuar usando-o."],
    },
  ],
};

export const TERMS_OF_USE: LegalDoc = {
  title: "Termos de Uso",
  updatedAt: "1º de outubro de 2026",
  intro: `Estes Termos regulam o uso do aplicativo Finança, oferecido por ${COMPANY.name}, CNPJ ${COMPANY.cnpj}. Ao criar uma conta, você declara que leu e concorda com eles e com a Política de Privacidade.`,
  sections: [
    {
      heading: "1. O que é o Finança",
      paragraphs: [
        "O Finança é uma ferramenta de organização financeira pessoal: permite registrar receitas e despesas, acompanhar contas e cartões, criar orçamentos e metas e visualizar gráficos.",
        "Não somos instituição financeira, não movimentamos seu dinheiro, não oferecemos crédito e não prestamos consultoria ou recomendação de investimentos. Os insights e cálculos são informativos e dependem dos dados que você registra.",
      ],
    },
    {
      heading: "2. Sua conta",
      paragraphs: [
        "Você deve ter 18 anos ou mais e fornecer informações verdadeiras. Você é responsável por manter sua senha em sigilo e por tudo o que ocorre na sua conta. Avise-nos imediatamente se suspeitar de uso indevido.",
        "Podemos suspender contas que violem estes Termos, coloquem o serviço em risco ou sejam usadas para fraude.",
      ],
    },
    {
      heading: "3. Uso permitido",
      paragraphs: [
        "É proibido: tentar acessar dados de outros usuários; burlar limites e mecanismos de segurança; fazer engenharia reversa do serviço; usá-lo para atividades ilegais; ou sobrecarregar nossos sistemas.",
      ],
    },
    {
      heading: "4. Open Finance",
      paragraphs: [
        "O recurso opcional de conexão com bancos usa o ecossistema regulado do Open Finance Brasil por meio de um parceiro autorizado. Você escolhe quais instituições e dados compartilhar e pode revogar o consentimento a qualquer momento, no aplicativo ou na sua instituição.",
        "Nunca pediremos a sua senha bancária. O acesso é autorizado diretamente no ambiente oficial do seu banco. O acesso é somente de leitura: o aplicativo não movimenta o seu dinheiro.",
        "Ao encerrar a conexão (ou retirar o consentimento), solicitamos o encerramento do acesso ao parceiro e apagamos as aplicações financeiras e os dados brutos ainda não aproveitados que foram lidos do banco; os lançamentos que você já incorporou ao aplicativo permanecem sob o seu controle.",
      ],
    },
    {
      heading: "5. Planos e pagamentos",
      paragraphs: [
        "Há um plano gratuito, com limites de uso, e um plano Premium opcional, com recursos adicionais. Quando contratado por meio das lojas de aplicativos, a cobrança, a renovação e os reembolsos seguem as regras da respectiva loja. Informaremos preços e condições antes da contratação.",
      ],
    },
    {
      heading: "6. Disponibilidade e responsabilidade",
      paragraphs: [
        "Trabalhamos para manter o serviço disponível e seguro, mas não garantimos funcionamento ininterrupto ou livre de erros. Mantenha seus próprios controles para decisões financeiras importantes.",
        "Na máxima extensão permitida por lei, não respondemos por perdas decorrentes de decisões tomadas com base nas informações do aplicativo, por dados inseridos incorretamente por você ou por falhas de terceiros (bancos, lojas de aplicativos, operadoras). Nada nestes Termos limita direitos assegurados pelo Código de Defesa do Consumidor.",
      ],
    },
    {
      heading: "7. Encerramento",
      paragraphs: [
        "Você pode excluir a sua conta a qualquer momento em Configurações → Privacidade e dados. A exclusão é definitiva e apaga os seus dados, conforme a Política de Privacidade.",
      ],
    },
    {
      heading: "8. Alterações",
      paragraphs: ["Podemos alterar estes Termos. Em mudanças relevantes, pediremos um novo aceite antes de você continuar usando o aplicativo."],
    },
    {
      heading: "9. Lei aplicável e contato",
      paragraphs: [
        `Aplica-se a legislação brasileira. Fica eleito o foro do domicílio do consumidor para dirimir controvérsias. Dúvidas ou solicitações: ${COMPANY.supportEmail}.`,
      ],
    },
  ],
};

export const LEGAL_DOCS = { terms: TERMS_OF_USE, privacy: PRIVACY_POLICY } as const;
export type LegalDocKey = keyof typeof LEGAL_DOCS;
