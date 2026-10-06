/**
 * Etapas do tutorial de primeiro acesso. Cada uma destaca um elemento REAL da interface (`target` é o id registrado por
 * `TourTarget`/`useTourTarget` na tela) e explica o que é e por que ajuda. Sem `target`, o cartão aparece no centro.
 *
 * Mantenha este texto fiel ao que o app tem: ao criar ou remover uma função importante, ajuste a etapa correspondente.
 */
export type TourStep = {
  id: string;
  /** Tela onde o elemento está (as abas ficam na raiz: "/", "/transactions", "/charts", "/wallet", "/investments", "/more"). */
  route: string;
  /** Id do elemento destacado. Sem ele, o cartão fica centralizado. */
  target?: string;
  icon: string;
  title: string;
  /** O que é e o que dá para fazer. */
  body: string;
  /** Por que isso é útil. */
  why: string;
};

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    route: "/",
    icon: "sparkles",
    title: "Bem-vindo(a) ao Finança",
    body: "Em cerca de 1 minuto você conhece tudo: registrar gastos, acompanhar contas e cartões, ver gráficos, controlar orçamentos e metas e acompanhar as novidades que estão chegando.",
    why: "Você pode pular quando quiser e rever o tutorial depois em Mais → Tutorial.",
  },
  {
    id: "balance",
    route: "/",
    target: "home-balance",
    icon: "wallet",
    title: "Seu saldo, num relance",
    body: "Aqui fica a soma de todas as suas contas e quanto você guardou do que recebeu no mês. Logo abaixo, receitas, despesas e economia.",
    why: "Abriu o app, já sabe como está o seu dinheiro. O olho no topo esconde os valores quando houver alguém por perto.",
  },
  {
    id: "quick-add",
    route: "/",
    target: "home-fab",
    icon: "plus",
    title: "Registre em segundos",
    body: "O botão + cria uma despesa, uma receita ou uma transferência entre contas. Funciona até sem internet: o lançamento fica na fila e é enviado quando a conexão voltar.",
    why: "Quanto mais rápido você anota, mais fiel fica o seu controle.",
  },
  {
    id: "transactions",
    route: "/transactions",
    target: "tx-tools",
    icon: "arrow-left-right",
    title: "Todas as suas transações",
    body: "Veja tudo o que entrou e saiu, com busca por descrição e filtros por conta, cartão, categoria e período. Toque em um lançamento para editar.",
    why: "Encontre qualquer gasto em segundos e corrija o que estiver errado.",
  },
  {
    id: "charts",
    route: "/charts",
    target: "charts-range",
    icon: "chart-pie",
    title: "Para onde vai o seu dinheiro",
    body: "Gráficos de despesas por categoria, receitas × despesas, evolução do saldo, fluxo de caixa e comparação entre meses. Troque o período aqui.",
    why: "Descubra onde dá para economizar e se este mês está melhor que o anterior.",
  },
  {
    id: "wallet",
    route: "/wallet",
    target: "wallet-tabs",
    icon: "credit-card",
    title: "Contas e cartões",
    body: "Cadastre suas contas e seus cartões de crédito. Cada cartão acompanha limite, fatura, vencimento e as compras parceladas.",
    why: "Saiba o que já está comprometido antes de gastar e não perca nenhum vencimento.",
  },
  {
    id: "investments",
    route: "/investments",
    target: "tab-investments",
    icon: "piggy-bank",
    title: "Seus investimentos",
    body: "Esta aba vai reunir os seus investimentos, com o CDI, o CDB e o seu porquinho rendendo dia a dia. Está em construção: toque nela para ver como vai funcionar.",
    why: "Quando chegar, você verá quanto o seu dinheiro rende sem montar planilha.",
  },
  {
    id: "planning",
    route: "/more",
    target: "more-planning",
    icon: "target",
    title: "Orçamentos, metas e recorrências",
    body: "Defina um limite por categoria, acompanhe objetivos (viagem, reserva de emergência) e cadastre contas e receitas que se repetem todo mês.",
    why: "O app avisa quando você chega perto do limite e lembra dos vencimentos.",
  },
  {
    id: "open-finance",
    route: "/more",
    target: "more-bank",
    icon: "link",
    title: "O que vem por aí",
    body: "Aqui ficam as Novidades e a explicação da conexão automática com bancos, que está a caminho: saldos e movimentações sem digitar, só leitura, autorizada no app do próprio banco.",
    why: "Você acompanha o que já chegou e o que está sendo preparado. Nunca pediremos a senha do seu banco.",
  },
  {
    id: "personalize",
    route: "/more",
    target: "more-settings",
    icon: "palette",
    title: "Deixe com a sua cara",
    body: "Em Configurações → Aparência você escolhe o tema (claro, escuro, azul, roxo, verde, vermelho ou as suas cores), ajusta notificações, biometria e privacidade, e pode exportar ou apagar seus dados.",
    why: "O tutorial fica sempre em Mais → Tutorial, caso queira rever.",
  },
];

/** Telas onde o tutorial pode começar sozinho (as abas principais). Fora delas (consentimento, login...) ele espera. */
const MAIN_PATHS = new Set(["/", "/transactions", "/charts", "/wallet", "/investments", "/more"]);
export function isMainPath(pathname: string): boolean {
  return MAIN_PATHS.has(pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname);
}
