/**
 * Mural de novidades: o que já chegou e o que está a caminho. Texto para o público: sem nome de fornecedor e sem prometer data.
 *
 * Mantenha fiel ao app: quando algo for lançado, mude o `status` para "done" e preencha `since` (AAAA-MM). Itens "soon" e "building" com
 * `preview` abrem a explicação (para que serve, como vai funcionar e o que esperar).
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
  /** Mês em que chegou (AAAA-MM). Só para "done". */
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
    id: "appearance",
    title: "Temas e personalização",
    summary: "Claro, escuro, azul, roxo, verde, vermelho ou as suas próprias cores, em todo o app.",
    icon: "palette",
    status: "done",
    since: "2026-10",
  },
  {
    id: "tour",
    title: "Tutorial de primeiro uso",
    summary: "Um passo a passo curto que mostra cada parte do app e para que ela serve. Dá para rever em Mais.",
    icon: "graduation-cap",
    status: "done",
    since: "2026-10",
  },
  {
    id: "motion",
    title: "Animações e acabamento",
    summary: "Telas, listas, gráficos e botões mais fluidos, com respeito à opção de reduzir movimento do seu aparelho.",
    icon: "sparkles",
    status: "done",
    since: "2026-10",
  },
] as const;

export const ROADMAP_SECTIONS: { status: RoadmapStatus; title: string; hint: string }[] = [
  { status: "building", title: "Em desenvolvimento", hint: "Estamos construindo agora" },
  { status: "soon", title: "Em breve", hint: "Já está nos planos, ainda sem data" },
  { status: "done", title: "Já chegou", hint: "O que você já pode usar" },
];

export const itemsByStatus = (status: RoadmapStatus): RoadmapItem[] => ROADMAP.filter((i) => i.status === status);
export const roadmapItem = (id: string | undefined): RoadmapItem | undefined => ROADMAP.find((i) => i.id === id);
