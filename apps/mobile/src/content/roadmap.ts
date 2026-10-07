/**
 * Mural de atualizações: tudo o que chegou (do mais recente para o mais antigo) e o que está a caminho. Texto para o público: sem nome de
 * fornecedor e sem prometer data para o que ainda não existe.
 *
 * REGRA: toda mudança que a pessoa perceba entra aqui. Quando algo for lançado, crie o item com `status: "done"` e `since` (AAAA-MM-DD, a data
 * em que chegou); o mural ordena sozinho. O que está sendo feito fica em "building"/"soon" (sem data) e vira "done" quando chegar. Itens com
 * `preview` abrem a explicação (para que serve, como funciona e o que esperar).
 */
export type RoadmapStatus = "done" | "building" | "soon";

export type RoadmapPreview = {
  /** Para que serve. */
  purpose: string;
  /** Como vai funcionar, em passos curtos. */
  how: string[];
  /** O que esperar (e o que não esperar). */
  expect: string[];
};

export type RoadmapItem = {
  id: string;
  title: string;
  summary: string;
  icon: string;
  status: RoadmapStatus;
  /** Dia em que chegou (AAAA-MM-DD). Só para "done". */
  since?: string;
  preview?: RoadmapPreview;
};

export const ROADMAP: readonly RoadmapItem[] = [
  {
    id: "investments",
    title: "Rendimentos: CDI, CDB e o seu porquinho",
    summary: "Veja quanto o seu dinheiro rende por dia e traga os seus investimentos para o Finança.",
    icon: "piggy-bank",
    status: "building",
    preview: {
      purpose: "Saber, sem planilha, quanto o seu porquinho e os seus investimentos de renda fixa estão rendendo hoje, neste mês e desde que você começou.",
      how: [
        "Você cadastra o porquinho, o CDB ou outra aplicação com o valor e a regra de rendimento (por exemplo, 100% do CDI).",
        "O app acompanha a taxa do CDI divulgada oficialmente e calcula o rendimento de cada dia útil.",
        "Você lança aportes e resgates, e o painel mostra o saldo atualizado, o rendimento do dia e o do mês.",
      ],
      expect: [
        "Valores estimados com base nas taxas oficiais: podem diferir um pouco do extrato do banco (arredondamentos, impostos e a data em que o banco credita).",
        "Vem como um plano a mais, opcional, e fica liberado durante os 30 dias de teste grátis.",
      ],
    },
  },
  {
    id: "social-login",
    title: "Entrar com Google, Facebook e outras contas",
    summary: "Criar a conta e entrar com um toque, sem decorar mais uma senha.",
    icon: "key-round",
    status: "building",
  },
  {
    id: "bank-connection",
    title: "Conexão automática com bancos",
    summary: "Traga saldos e movimentações do seu banco para o Finança, sem digitar.",
    icon: "link",
    status: "soon",
    preview: {
      purpose: "Poupar a digitação: saldos e movimentações do seu banco aparecem no app para você só conferir e categorizar.",
      how: [
        "Você escolhe o seu banco e autoriza dentro do aplicativo ou site do próprio banco. O Finança nunca vê nem guarda a sua senha.",
        "Você decide o que compartilhar (contas, cartões, investimentos) e por quanto tempo.",
        "As movimentações chegam para você revisar antes de entrarem nas suas contas, e o app se atualiza sozinho.",
        "A qualquer momento você encerra a conexão e os dados trazidos do banco são apagados.",
      ],
      expect: [
        "É somente leitura: o app não movimenta o seu dinheiro.",
        "Vem em uma atualização futura, ainda sem data. Quando estiver pronto, você será avisado(a) aqui no mural.",
      ],
    },
  },
  {
    id: "plans",
    title: "Assinatura: plano anual ou mensal",
    summary: "Quando a cobrança começar, você escolhe pagar por ano (com desconto) ou por mês, que renova sozinho ou é pago uma vez só, com Pix, e pode incluir o Rendimentos.",
    icon: "crown",
    status: "soon",
    preview: {
      purpose: "Dar a escolha entre pagar por ano, saindo mais barato, ou todo mês, com mais flexibilidade, e entre renovar sozinho ou pagar só um período fechado. Você sempre vê o valor antes de pagar.",
      how: [
        "Em Mais → Assinatura você vê os dois planos lado a lado, com o valor de cada um. O anual aparece primeiro, já com a economia calculada.",
        "Você escolhe: “Renova sozinha” (cartão, cobrado a cada ciclo) ou “Pagar uma vez” (30 dias ou 1 ano, com Pix ou cartão, sem renovação automática).",
        "O pagamento acontece numa página segura, aberta em outra aba: o Finança nunca vê nem guarda os dados do seu cartão, e a tela confirma sozinha quando o pagamento cair.",
        "Quem pagou uma vez renova quando quiser, e o prazo novo soma ao que ainda restava. Quem assina troca o cartão, vê as faturas e cancela quando quiser.",
      ],
      expect: [
        "Você tem 30 dias de teste grátis, com tudo liberado, antes de qualquer cobrança.",
        "Quando o teste acabar sem assinatura, o app fica somente leitura: você continua vendo e exportando tudo, e nada é apagado.",
      ],
    },
  },
  {
    id: "badges",
    title: "Insígnias: 53 conquistas, de Bronze a Mestre",
    summary: "Ganhe insígnias por registrar, economizar, planejar e cuidar da conta. Cada uma tem 6 níveis, e o topo é o Mestre, em roxo profundo. Criar a conta já dá a primeira.",
    icon: "gem",
    status: "done",
    since: "2026-10-07",
  },
  {
    id: "themes-families",
    title: "Temas opacos, foscos e pastéis",
    summary: "Quinze temas novos em três famílias: cores cheias e chapadas, tons acinzentados e cores claras e delicadas. Em Configurações → Aparência.",
    icon: "palette",
    status: "done",
    since: "2026-10-07",
  },
  {
    id: "living-background",
    title: "Fundo com a logo em cubos",
    summary: "A logo do Finança aparece inteira ao fundo, feita de muitos cubos. No computador eles reagem quando o mouse passa; no celular, sobem e descem sozinhos.",
    icon: "layers",
    status: "done",
    since: "2026-10-07",
  },
  {
    id: "two-factor",
    title: "Verificação em duas etapas",
    summary: "Proteja a conta com um código do celular. Ele é pedido a cada entrada e a cada abertura do app; depois de 3 códigos errados, você é desconectado por segurança.",
    icon: "shield-check",
    status: "done",
    since: "2026-10-06",
  },
  {
    id: "my-account",
    title: "Minha conta",
    summary: "Veja os dados do seu cadastro e troque nome, e-mail e senha, com limites por mês e por ano para proteger a conta.",
    icon: "user",
    status: "done",
    since: "2026-10-06",
  },
  {
    id: "celebrations",
    title: "Comemorações animadas",
    summary: "Meta batida, dinheiro guardado, insígnia nova: tela cheia com brilhos, confete e foguete para comemorar com você.",
    icon: "party-popper",
    status: "done",
    since: "2026-10-06",
  },
  {
    id: "trial-notice",
    title: "30 dias de teste grátis, bem explicados",
    summary: "No primeiro acesso você vê que está no teste grátis, até quando vale e como assinar antes, se quiser acesso completo já.",
    icon: "gift",
    status: "done",
    since: "2026-10-06",
  },
  {
    id: "support",
    title: "Ajuda e suporte",
    summary: "Fale com a gente pelo WhatsApp ou pelo e-mail direto do app, em Mais → Ajuda e suporte.",
    icon: "life-buoy",
    status: "done",
    since: "2026-10-06",
  },
  {
    id: "legal",
    title: "Termos de Uso e Política de Privacidade renovados",
    summary: "Textos mais claros e detalhados, com seus direitos e as leis que protegem os seus dados. Em Mais → Privacidade e dados.",
    icon: "file-text",
    status: "done",
    since: "2026-10-06",
  },
  {
    id: "appearance",
    title: "Temas e personalização",
    summary: "Claro, escuro, azul, roxo, verde, vermelho ou as suas próprias cores, em todo o app.",
    icon: "palette",
    status: "done",
    since: "2026-10-05",
  },
  {
    id: "tour",
    title: "Tutorial de primeiro uso",
    summary: "Um passo a passo curto que mostra cada parte do app e para que ela serve. Dá para rever em Mais.",
    icon: "graduation-cap",
    status: "done",
    since: "2026-10-05",
  },
  {
    id: "motion",
    title: "Animações e acabamento",
    summary: "Telas, listas, gráficos e botões mais fluidos, com respeito à opção de reduzir movimento do seu aparelho.",
    icon: "sparkles",
    status: "done",
    since: "2026-10-04",
  },
] as const;

export const ROADMAP_SECTIONS: { status: RoadmapStatus; title: string; hint: string }[] = [
  { status: "building", title: "Em desenvolvimento", hint: "Estamos construindo agora" },
  { status: "soon", title: "Em breve", hint: "Já está nos planos, ainda sem data" },
  { status: "done", title: "Já chegou", hint: "Tudo o que é novo, do mais recente para o mais antigo" },
];

/** Itens de um status. Os que já chegaram saem do mais recente para o mais antigo (empate: a ordem da lista). */
export const itemsByStatus = (status: RoadmapStatus): RoadmapItem[] => {
  const items = ROADMAP.filter((i) => i.status === status);
  return status === "done" ? items.map((item, order) => ({ item, order })).sort((a, b) => (b.item.since ?? "").localeCompare(a.item.since ?? "") || a.order - b.order).map((x) => x.item) : items;
};

/** Chegou há pouco (até `days` dias antes de `today`, AAAA-MM-DD)? Vira o selo "Novo". */
export function isRecent(since: string | undefined, today: string, days = 7): boolean {
  if (!since) return false;
  const diff = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000;
  return diff >= 0 && diff <= days;
}
export const roadmapItem = (id: string | undefined): RoadmapItem | undefined => ROADMAP.find((i) => i.id === id);
