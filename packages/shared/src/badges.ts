import { z } from "zod";
import { timestamp } from "./schemas/common";

// ===================================================================================================================
// INSÍGNIAS: conquistas por usar bem o Finança. Cada insígnia tem 6 níveis (Bronze → Mestre) e é medida por um número calculado a partir dos
// dados da própria pessoa. Os níveis, uma vez ganhos, nunca são tirados (apagar lançamentos não "desconquista" nada).
// Este arquivo é o catálogo (nomes, textos, metas de cada nível); o servidor calcula os números e o app desenha a arte.
// ===================================================================================================================

export const BADGE_TIERS = ["bronze", "silver", "gold", "platinum", "diamond", "master"] as const;
export type BadgeTier = (typeof BADGE_TIERS)[number];
export const BadgeTierSchema = z.enum(BADGE_TIERS);

/** Nome de cada nível, na ordem. O último, Mestre, é o roxo profundo. */
export const TIER_LABEL: Record<BadgeTier, string> = { bronze: "Bronze", silver: "Prata", gold: "Ouro", platinum: "Platina", diamond: "Diamante", master: "Mestre" };

/** Pontos de cada nível ganho (somam no total da coleção). */
export const TIER_POINTS: Record<BadgeTier, number> = { bronze: 10, silver: 25, gold: 50, platinum: 100, diamond: 200, master: 400 };

/** Frase curta de cada nível, para a tela de conquista. */
export const TIER_TAGLINE: Record<BadgeTier, string> = {
  bronze: "O primeiro passo está dado.",
  silver: "Você pegou o ritmo.",
  gold: "Isso já é hábito de verdade.",
  platinum: "Pouca gente chega aqui.",
  diamond: "Brilho raro. Você é referência.",
  master: "O topo. Lenda do Finança.",
};

export const BADGE_CATEGORIES = [
  { id: "habit", label: "Constância", icon: "flame" },
  { id: "entries", label: "Lançamentos", icon: "pencil" },
  { id: "saving", label: "Economia", icon: "piggy-bank" },
  { id: "planning", label: "Planejamento", icon: "target" },
  { id: "goals", label: "Metas", icon: "trophy" },
  { id: "cards", label: "Contas e cartões", icon: "credit-card" },
  { id: "organization", label: "Organização", icon: "tag" },
  { id: "app", label: "Você no app", icon: "sparkles" },
] as const;
export type BadgeCategoryId = (typeof BADGE_CATEGORIES)[number]["id"];

/** Os números que o servidor calcula para cada pessoa. Cada insígnia aponta para um deles. */
export const METRIC_KEYS = [
  // constância
  "tenureDays", "dailyStreak", "weeklyStreak", "activeDays", "trackedMonths", "closerMonths", "sameDayEntries", "weekendEntries",
  // lançamentos
  "entriesTotal", "expenseEntries", "incomeEntries", "notedEntries", "transfers", "installmentPlans", "maxEntriesInDay", "paymentMethods", "categorizedEntries",
  // economia
  "savingMonths", "savingStreak", "savedTotalCents", "bestSavingRatePct", "incomeTotalCents", "expenseTotalCents", "spendDownStreak", "netWorthCents", "cushionMonths", "zeroDays", "biggestIncomeCents",
  // planejamento
  "budgetsCreated", "budgetsMet", "perfectMonths", "budgetCategories", "budgetMonths", "recurringRules", "recurringGenerated",
  // metas
  "goalsCreated", "goalsAchieved", "goalContributions", "goalSavedCents", "contributionStreak", "biggestGoalCents",
  // contas e cartões
  "cards", "invoicePayments", "punctualPayments", "cardEntries", "accounts",
  // organização
  "customCategories", "categoriesUsed", "incomeCategoriesUsed",
  // você no app
  "firstSteps", "dataExports", "notificationsRead", "securityScore",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];
export type Metrics = Record<MetricKey, number>;

/** Como o número aparece na tela. */
export type BadgeUnit = "count" | "days" | "weeks" | "months" | "money" | "percent";

type Six = readonly [number, number, number, number, number, number];

export type BadgeDef = {
  id: string;
  category: BadgeCategoryId;
  name: string;
  /** Nome do ícone (conjunto do app). */
  icon: string;
  metric: MetricKey;
  unit: BadgeUnit;
  /** Valor mínimo de cada nível, do Bronze ao Mestre (estritamente crescente). */
  thresholds: Six;
  /** O que conta (uma frase). */
  what: string;
  /** Como evoluir (uma frase prática). */
  how: string;
  /** Frase de efeito, para encantar. */
  lore: string;
};

const R = (reais: number) => reais * 100;
const def = (d: BadgeDef): BadgeDef => d;

export const BADGES: readonly BadgeDef[] = [
  // ------------------------------------------------------------------------------------------------ Constância
  def({ id: "welcome", category: "habit", name: "Boas-vindas", icon: "hand-heart", metric: "tenureDays", unit: "days", thresholds: [1, 7, 30, 90, 365, 730],
    what: "Dias de conta no Finança (o dia em que você criou a conta já conta como o primeiro).", how: "O Bronze vem ao criar a conta; depois é só continuar por aqui: o tempo faz o resto.", lore: "Que bom ter você aqui. Quem fica, colhe." }),
  def({ id: "daily-streak", category: "habit", name: "Chama acesa", icon: "flame", metric: "dailyStreak", unit: "days", thresholds: [3, 7, 14, 30, 60, 120],
    what: "Maior sequência de dias seguidos em que você registrou algum lançamento.", how: "Registre ao menos um lançamento por dia, sem pular.", lore: "A chama que não apaga." }),
  def({ id: "weekly-streak", category: "habit", name: "Semana a semana", icon: "repeat", metric: "weeklyStreak", unit: "weeks", thresholds: [2, 4, 8, 16, 32, 52],
    what: "Maior sequência de semanas seguidas com pelo menos um lançamento.", how: "Registre algo em toda semana, mesmo que seja pouco.", lore: "Constância vence intensidade." }),
  def({ id: "active-days", category: "habit", name: "Presença", icon: "calendar", metric: "activeDays", unit: "days", thresholds: [5, 20, 60, 150, 300, 600],
    what: "Quantos dias diferentes você registrou lançamentos.", how: "Volte e registre em mais dias.", lore: "Aparecer é metade do caminho." }),
  def({ id: "months-tracked", category: "habit", name: "Mês a mês", icon: "chart-column", metric: "trackedMonths", unit: "months", thresholds: [1, 2, 4, 8, 12, 24],
    what: "Meses diferentes com lançamentos no app.", how: "Acompanhe as finanças de mais meses.", lore: "Um ano de histórico vale ouro." }),
  def({ id: "monthly-closer", category: "habit", name: "Fechamento certinho", icon: "circle-check", metric: "closerMonths", unit: "months", thresholds: [1, 2, 4, 8, 12, 24],
    what: "Meses em que você registrou lançamentos em 15 dias ou mais.", how: "Registre ao longo do mês inteiro, não só de vez em quando.", lore: "O mês inteiro sob controle." }),
  def({ id: "same-day", category: "habit", name: "Em dia com o dia", icon: "clock", metric: "sameDayEntries", unit: "count", thresholds: [10, 50, 150, 400, 1000, 2500],
    what: "Lançamentos registrados no mesmo dia em que aconteceram.", how: "Anote na hora, enquanto a memória está fresca.", lore: "Quem anota na hora nunca se perde." }),
  def({ id: "weekend-keeper", category: "habit", name: "Fim de semana também", icon: "sun", metric: "weekendEntries", unit: "count", thresholds: [5, 20, 60, 150, 400, 1000],
    what: "Lançamentos de sábados e domingos.", how: "Não esqueça os gastos do fim de semana.", lore: "O dinheiro não tira folga." }),

  // ------------------------------------------------------------------------------------------------ Lançamentos
  def({ id: "scribe", category: "entries", name: "Anotador", icon: "pencil", metric: "entriesTotal", unit: "count", thresholds: [10, 50, 150, 500, 1500, 5000],
    what: "Total de lançamentos (receitas e despesas).", how: "Registre cada receita e despesa.", lore: "Quem anota, controla." }),
  def({ id: "expense-tracker", category: "entries", name: "Cada centavo", icon: "receipt", metric: "expenseEntries", unit: "count", thresholds: [10, 50, 200, 600, 1500, 4000],
    what: "Despesas registradas.", how: "Anote até os gastos pequenos: eles somam.", lore: "Os centavos têm a sua fama." }),
  def({ id: "income-tracker", category: "entries", name: "Renda no radar", icon: "banknote", metric: "incomeEntries", unit: "count", thresholds: [3, 12, 36, 100, 300, 1000],
    what: "Receitas registradas.", how: "Lance salário, extras e tudo o que entra.", lore: "Saber o que entra é metade da conta." }),
  def({ id: "describer", category: "entries", name: "Detalhista", icon: "book-open", metric: "notedEntries", unit: "count", thresholds: [3, 15, 50, 150, 400, 1000],
    what: "Lançamentos com observação.", how: "Escreva uma observação nos lançamentos.", lore: "Detalhe hoje, clareza amanhã." }),
  def({ id: "transferor", category: "entries", name: "Vai e vem", icon: "arrow-left-right", metric: "transfers", unit: "count", thresholds: [1, 5, 20, 60, 150, 400],
    what: "Transferências entre as suas contas.", how: "Registre as transferências como transferência (não como despesa).", lore: "O dinheiro muda de casa, não some." }),
  def({ id: "installer", category: "entries", name: "Parcelas na mão", icon: "layers", metric: "installmentPlans", unit: "count", thresholds: [1, 3, 6, 12, 24, 48],
    what: "Compras parceladas registradas.", how: "Cadastre as compras parceladas com todas as parcelas.", lore: "Parcela vista é parcela controlada." }),
  def({ id: "big-day", category: "entries", name: "Dia cheio", icon: "ticket", metric: "maxEntriesInDay", unit: "count", thresholds: [3, 5, 8, 12, 20, 30],
    what: "Maior número de lançamentos que você fez num só dia.", how: "Em dia de muito movimento, registre tudo.", lore: "Dia corrido, controle em dia." }),
  def({ id: "payment-mix", category: "entries", name: "De todo jeito", icon: "wallet", metric: "paymentMethods", unit: "count", thresholds: [1, 2, 3, 4, 5, 6],
    what: "Formas de pagamento diferentes nos seus lançamentos (Pix, débito, crédito, dinheiro, boleto, TED/DOC).", how: "Informe a forma de pagamento nos lançamentos.", lore: "Pix, cartão, dinheiro: tudo no mapa." }),
  def({ id: "categorized", category: "entries", name: "Tudo no lugar", icon: "tag", metric: "categorizedEntries", unit: "count", thresholds: [20, 100, 300, 800, 2000, 5000],
    what: "Lançamentos com categoria.", how: "Escolha uma categoria em cada lançamento.", lore: "Cada coisa no seu lugar." }),

  // ------------------------------------------------------------------------------------------------ Economia
  def({ id: "saver-months", category: "saving", name: "Economista", icon: "piggy-bank", metric: "savingMonths", unit: "months", thresholds: [1, 3, 6, 12, 24, 36],
    what: "Meses fechados em que você gastou menos do que recebeu.", how: "Termine o mês com as receitas acima das despesas.", lore: "Sobrar é um talento." }),
  def({ id: "blue-streak", category: "saving", name: "No azul", icon: "trending-up", metric: "savingStreak", unit: "months", thresholds: [2, 3, 6, 9, 12, 18],
    what: "Maior sequência de meses fechados seguidos no azul.", how: "Encadeie meses em que sobra dinheiro.", lore: "Mês após mês, no azul." }),
  def({ id: "saved-total", category: "saving", name: "Cofre cheio", icon: "coins", metric: "savedTotalCents", unit: "money", thresholds: [R(100), R(500), R(2_000), R(10_000), R(50_000), R(200_000)],
    what: "Soma do que sobrou nos meses fechados em que você ficou no azul.", how: "Gaste menos do que recebe e deixe sobrar.", lore: "Pouco a pouco, o cofre enche." }),
  def({ id: "saving-rate", category: "saving", name: "Mestre da economia", icon: "percent", metric: "bestSavingRatePct", unit: "percent", thresholds: [10, 20, 30, 40, 55, 70],
    what: "Maior fatia da renda que você guardou num mês fechado.", how: "Em um mês, tente guardar uma fatia maior do que recebeu.", lore: "Guardar 30% é raro. Mais ainda, lenda." }),
  def({ id: "income-volume", category: "saving", name: "Dinheiro em movimento", icon: "hand-coins", metric: "incomeTotalCents", unit: "money", thresholds: [R(1_000), R(5_000), R(20_000), R(100_000), R(500_000), R(2_000_000)],
    what: "Total de receitas que você já registrou.", how: "Registre todas as suas receitas.", lore: "Quanto já passou por você." }),
  def({ id: "expense-radar", category: "saving", name: "Radar de gastos", icon: "chart-line", metric: "expenseTotalCents", unit: "money", thresholds: [R(1_000), R(5_000), R(20_000), R(100_000), R(500_000), R(2_000_000)],
    what: "Total de despesas que você já acompanhou.", how: "Registre as suas despesas para enxergar para onde o dinheiro vai.", lore: "O que se mede, se melhora." }),
  def({ id: "spend-down", category: "saving", name: "Gasto em queda", icon: "circle-check", metric: "spendDownStreak", unit: "months", thresholds: [1, 2, 3, 4, 6, 9],
    what: "Maior sequência de meses fechados com despesas menores que as do mês anterior.", how: "Gaste um pouco menos a cada mês.", lore: "Descendo a ladeira dos gastos." }),
  def({ id: "net-worth", category: "saving", name: "Patrimônio", icon: "wallet", metric: "netWorthCents", unit: "money", thresholds: [R(1_000), R(5_000), R(20_000), R(100_000), R(500_000), R(1_000_000)],
    what: "Saldo total das suas contas hoje.", how: "Faça o saldo das contas crescer.", lore: "Tudo o que você construiu, num número." }),
  def({ id: "cushion", category: "saving", name: "Colchão financeiro", icon: "shield", metric: "cushionMonths", unit: "months", thresholds: [1, 2, 3, 6, 12, 24],
    what: "Quantos meses de despesas o seu saldo cobre (pela média dos últimos meses fechados).", how: "Construa uma reserva de emergência.", lore: "Dormir tranquilo não tem preço." }),
  def({ id: "zero-days", category: "saving", name: "Dia zero", icon: "moon", metric: "zeroDays", unit: "days", thresholds: [3, 10, 30, 75, 150, 365],
    what: "Dias sem nenhuma despesa, nos meses em que você usa o app.", how: "Passe dias sem gastar.", lore: "Um dia sem gastar vale por dois." }),
  def({ id: "single-income", category: "saving", name: "Grande entrada", icon: "banknote", metric: "biggestIncomeCents", unit: "money", thresholds: [R(500), R(2_000), R(5_000), R(10_000), R(25_000), R(100_000)],
    what: "A maior receita que você registrou de uma vez.", how: "Registre as suas entradas grandes (bônus, vendas, 13º).", lore: "Entrada grande, controle maior." }),

  // ------------------------------------------------------------------------------------------------ Planejamento
  def({ id: "planner", category: "planning", name: "Planejador", icon: "target", metric: "budgetsCreated", unit: "count", thresholds: [1, 3, 6, 12, 24, 48],
    what: "Orçamentos que você criou.", how: "Crie orçamentos por categoria.", lore: "Planejar é decidir antes de gastar." }),
  def({ id: "in-limit", category: "planning", name: "Dentro do limite", icon: "circle-check", metric: "budgetsMet", unit: "count", thresholds: [1, 5, 15, 40, 100, 250],
    what: "Orçamentos de meses fechados que você respeitou (gastou algo e ficou abaixo do limite).", how: "Mantenha cada categoria abaixo do orçamento.", lore: "Limite é liberdade." }),
  def({ id: "perfect-month", category: "planning", name: "Mês perfeito", icon: "gem", metric: "perfectMonths", unit: "months", thresholds: [1, 2, 4, 6, 9, 12],
    what: "Meses fechados em que TODOS os seus orçamentos foram respeitados.", how: "Respeite todos os orçamentos do mês.", lore: "Zero estouros. Impecável." }),
  def({ id: "budget-variety", category: "planning", name: "Orçamento de tudo", icon: "layers", metric: "budgetCategories", unit: "count", thresholds: [1, 3, 5, 8, 12, 16],
    what: "Categorias diferentes com orçamento.", how: "Crie orçamentos para mais categorias.", lore: "Cada categoria com o seu teto." }),
  def({ id: "budget-months", category: "planning", name: "Planejamento contínuo", icon: "calendar", metric: "budgetMonths", unit: "months", thresholds: [1, 2, 3, 6, 12, 24],
    what: "Meses diferentes com orçamento definido.", how: "Defina orçamentos todo mês (dá para copiar o do mês anterior).", lore: "Todo mês, um plano." }),
  def({ id: "autopilot", category: "planning", name: "Piloto automático", icon: "repeat", metric: "recurringRules", unit: "count", thresholds: [1, 3, 6, 10, 15, 25],
    what: "Lançamentos recorrentes ativos (contas e receitas que se repetem).", how: "Cadastre as contas fixas como recorrências.", lore: "Quem automatiza, ganha tempo." }),
  def({ id: "automated", category: "planning", name: "Tudo no automático", icon: "zap", metric: "recurringGenerated", unit: "count", thresholds: [3, 12, 36, 100, 300, 800],
    what: "Lançamentos gerados sozinhos pelas suas recorrências.", how: "Deixe as recorrências trabalharem por você.", lore: "O app lança, você relaxa." }),

  // ------------------------------------------------------------------------------------------------ Metas
  def({ id: "dreamer", category: "goals", name: "Sonhador", icon: "star", metric: "goalsCreated", unit: "count", thresholds: [1, 2, 4, 7, 10, 15],
    what: "Metas que você criou.", how: "Crie metas para os seus objetivos.", lore: "Todo sonho começa com um número." }),
  def({ id: "achiever", category: "goals", name: "Conquistador", icon: "trophy", metric: "goalsAchieved", unit: "count", thresholds: [1, 2, 4, 7, 12, 20],
    what: "Metas que você alcançou.", how: "Guarde dinheiro até completar as metas.", lore: "Meta batida, sonho realizado." }),
  def({ id: "contributor", category: "goals", name: "Aporte firme", icon: "piggy-bank", metric: "goalContributions", unit: "count", thresholds: [1, 5, 15, 40, 100, 250],
    what: "Aportes feitos nas suas metas.", how: "Faça aportes nas metas, mesmo pequenos.", lore: "Pouco, sempre, rende muito." }),
  def({ id: "goal-vault", category: "goals", name: "Cofre das metas", icon: "gem", metric: "goalSavedCents", unit: "money", thresholds: [R(100), R(1_000), R(5_000), R(20_000), R(100_000), R(500_000)],
    what: "Total guardado nas suas metas.", how: "Aumente o valor guardado nas metas.", lore: "O que você já separou para o futuro." }),
  def({ id: "contribution-streak", category: "goals", name: "Pingando todo mês", icon: "repeat", metric: "contributionStreak", unit: "months", thresholds: [2, 3, 6, 9, 12, 18],
    what: "Maior sequência de meses seguidos com aporte em alguma meta.", how: "Faça um aporte em toda a virada de mês.", lore: "Gota a gota, o oceano." }),
  def({ id: "big-goal", category: "goals", name: "Sonho grande", icon: "rocket", metric: "biggestGoalCents", unit: "money", thresholds: [R(1_000), R(5_000), R(20_000), R(100_000), R(500_000), R(2_000_000)],
    what: "O valor da sua maior meta.", how: "Ouse: crie uma meta maior.", lore: "Quem sonha alto, voa alto." }),

  // ------------------------------------------------------------------------------------------------ Contas e cartões
  def({ id: "card-collector", category: "cards", name: "Cartões na mão", icon: "credit-card", metric: "cards", unit: "count", thresholds: [1, 2, 3, 4, 6, 8],
    what: "Cartões de crédito cadastrados.", how: "Cadastre os seus cartões para acompanhar fatura e limite.", lore: "Cada cartão com a sua fatura." }),
  def({ id: "invoice-payer", category: "cards", name: "Fatura paga", icon: "receipt", metric: "invoicePayments", unit: "count", thresholds: [1, 3, 6, 12, 24, 48],
    what: "Pagamentos de fatura registrados.", how: "Registre o pagamento de cada fatura.", lore: "Fatura quitada, cabeça leve." }),
  def({ id: "punctual", category: "cards", name: "Pontual", icon: "clock", metric: "punctualPayments", unit: "count", thresholds: [1, 3, 6, 12, 24, 48],
    what: "Faturas pagas até o dia do vencimento.", how: "Pague a fatura até o vencimento.", lore: "Nem um dia de atraso." }),
  def({ id: "card-entries", category: "cards", name: "Cartão sob controle", icon: "credit-card", metric: "cardEntries", unit: "count", thresholds: [5, 25, 100, 300, 800, 2000],
    what: "Compras no cartão registradas.", how: "Lance as compras do cartão na hora.", lore: "Do cartão, nada escapa." }),
  def({ id: "multi-account", category: "cards", name: "Multiconta", icon: "landmark", metric: "accounts", unit: "count", thresholds: [1, 2, 3, 4, 6, 8],
    what: "Contas cadastradas (corrente, poupança, carteira...).", how: "Cadastre todas as suas contas.", lore: "Todas as contas, uma visão só." }),

  // ------------------------------------------------------------------------------------------------ Organização
  def({ id: "category-maker", category: "organization", name: "Criativo", icon: "palette", metric: "customCategories", unit: "count", thresholds: [1, 3, 6, 10, 20, 40],
    what: "Categorias que você criou.", how: "Crie categorias do seu jeito.", lore: "O seu jeito de organizar." }),
  def({ id: "category-variety", category: "organization", name: "Variedade", icon: "chart-pie", metric: "categoriesUsed", unit: "count", thresholds: [3, 6, 10, 15, 20, 30],
    what: "Categorias diferentes usadas nos seus lançamentos.", how: "Use mais categorias nos lançamentos.", lore: "Uma vida, muitas categorias." }),
  def({ id: "income-sources", category: "organization", name: "Fontes de renda", icon: "briefcase", metric: "incomeCategoriesUsed", unit: "count", thresholds: [1, 2, 3, 4, 5, 6],
    what: "Categorias de receita diferentes usadas.", how: "Separe as receitas por origem (salário, extras, rendimentos...).", lore: "Mais de uma fonte, mais segurança." }),

  // ------------------------------------------------------------------------------------------------ Você no app
  def({ id: "first-steps", category: "app", name: "Pé na estrada", icon: "rocket", metric: "firstSteps", unit: "count", thresholds: [1, 2, 3, 4, 5, 6],
    what: "Primeiros passos concluídos: nome, tutorial, conta, primeiro lançamento, orçamento e meta.", how: "Complete cada primeiro passo.", lore: "Todo começo é uma decolagem." }),
  def({ id: "data-owner", category: "app", name: "Dono dos dados", icon: "download", metric: "dataExports", unit: "count", thresholds: [1, 2, 3, 5, 8, 12],
    what: "Vezes em que você exportou os seus dados.", how: "Exporte os seus dados em Privacidade e dados.", lore: "Os dados são seus: leve quando quiser." }),
  def({ id: "watcher", category: "app", name: "Atento", icon: "bell", metric: "notificationsRead", unit: "count", thresholds: [5, 25, 75, 200, 500, 1000],
    what: "Notificações que você leu.", how: "Leia os avisos de vencimento, orçamento e metas.", lore: "Quem presta atenção, não paga multa." }),
  def({ id: "shielded", category: "app", name: "Blindado", icon: "shield-check", metric: "securityScore", unit: "count", thresholds: [1, 2, 3, 4, 5, 6],
    what: "Cuidados com a conta: verificação em duas etapas, nome, tutorial, troca de senha, avisos ligados e exportação dos dados.", how: "Ligue a verificação em duas etapas e complete o perfil.", lore: "Dinheiro seguro começa na conta segura." }),
] as const;

// ===================================================================================================================
// Regras de cálculo (usadas pelo servidor e pelo app)
// ===================================================================================================================

/** Quantos níveis (0 a 6) o valor alcança. */
export function tierReached(def: Pick<BadgeDef, "thresholds">, value: number): number {
  let reached = 0;
  for (const t of def.thresholds) if (value >= t) reached++;
  return reached;
}

/** Próximo nível a conquistar (ou `null` se já é Mestre). */
export function nextTarget(def: Pick<BadgeDef, "thresholds">, value: number): { tier: BadgeTier; threshold: number } | null {
  const reached = tierReached(def, value);
  return reached >= BADGE_TIERS.length ? null : { tier: BADGE_TIERS[reached]!, threshold: def.thresholds[reached]! };
}

/** Progresso (0 a 1) rumo ao próximo nível, a partir do nível atual. Mestre = 1. */
export function progressToNext(def: Pick<BadgeDef, "thresholds">, value: number): number {
  const reached = tierReached(def, value);
  if (reached >= BADGE_TIERS.length) return 1;
  const from = reached === 0 ? 0 : def.thresholds[reached - 1]!;
  const to = def.thresholds[reached]!;
  return Math.max(0, Math.min(1, (value - from) / Math.max(1, to - from)));
}

/** Pontos da coleção a partir dos níveis ganhos de cada insígnia. */
export function badgePoints(levels: number[]): number {
  return levels.reduce((sum, level) => sum + BADGE_TIERS.slice(0, level).reduce((s, t) => s + TIER_POINTS[t], 0), 0);
}

// ===================================================================================================================
// Desconto na assinatura por insígnias
// ===================================================================================================================

/** Nível mínimo (1 = Bronze ... 6 = Mestre) para a insígnia contar no desconto: Ouro (3) ou acima (Platina, Diamante e Mestre também valem). */
export const DISCOUNT_MIN_LEVEL = 3;
/** A cada tantas insígnias nesse nível... */
export const DISCOUNT_BADGES_PER_STEP = 5;
/** ...a pessoa ganha tantos pontos percentuais de desconto na assinatura (mensal ou anual)... */
export const DISCOUNT_STEP_PERCENT = 5;
/** ...até este teto. */
export const DISCOUNT_CAP_PERCENT = 15;

export const badgeDiscountDTO = z.object({
  /** Insígnias que já estão no nível Ouro ou acima (as que contam). */
  qualifying: z.number().int().min(0),
  /** Desconto que a pessoa tem agora, em % (0, 5, 10 ou 15). */
  percent: z.number().int().min(0).max(100),
  /** O teto do desconto, em %. */
  capPercent: z.number().int(),
  /** A cada quantas insígnias (Ouro ou acima) sobe um degrau. */
  badgesPerStep: z.number().int(),
  /** Quanto cada degrau vale, em pontos percentuais. */
  stepPercent: z.number().int(),
  /** Desconto do próximo degrau; `null` = já está no teto. */
  nextPercent: z.number().int().nullable(),
  /** Quantas insígnias faltam (Ouro ou acima) para o próximo degrau; `null` = já está no teto. */
  badgesToNext: z.number().int().nullable(),
});
export type BadgeDiscount = z.infer<typeof badgeDiscountDTO>;

/**
 * Desconto na assinatura pelas insígnias: cada 5 insígnias no nível Ouro (ou acima) dão 5%, até 15%. `levels` são os níveis (0 a 6) de todas as
 * insígnias da pessoa. Níveis ganhos nunca saem, então o desconto só cresce.
 */
export function badgeDiscount(levels: readonly number[]): BadgeDiscount {
  const qualifying = levels.filter((l) => l >= DISCOUNT_MIN_LEVEL).length;
  const steps = Math.floor(qualifying / DISCOUNT_BADGES_PER_STEP);
  const percent = Math.min(DISCOUNT_CAP_PERCENT, steps * DISCOUNT_STEP_PERCENT);
  const atCap = percent >= DISCOUNT_CAP_PERCENT;
  return {
    qualifying,
    percent,
    capPercent: DISCOUNT_CAP_PERCENT,
    badgesPerStep: DISCOUNT_BADGES_PER_STEP,
    stepPercent: DISCOUNT_STEP_PERCENT,
    nextPercent: atCap ? null : percent + DISCOUNT_STEP_PERCENT,
    badgesToNext: atCap ? null : (steps + 1) * DISCOUNT_BADGES_PER_STEP - qualifying,
  };
}

/** Valor com o desconto aplicado (centavos, arredondado), como o provedor de pagamento calcula. */
export function discountedCents(amountCents: number, percent: number): number {
  return Math.round((amountCents * (100 - Math.min(100, Math.max(0, percent)))) / 100);
}

const brl = (cents: number) => `R$ ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.round(cents / 100))}`;

/** Valor com a unidade, para as telas ("30 dias", "R$ 5.000", "40%"). */
export function formatBadgeValue(unit: BadgeUnit, value: number): string {
  const n = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  switch (unit) {
    case "money":
      return brl(value);
    case "percent":
      return `${n.format(value)}%`;
    case "days":
      return `${n.format(value)} ${value === 1 ? "dia" : "dias"}`;
    case "weeks":
      return `${n.format(value)} ${value === 1 ? "semana" : "semanas"}`;
    case "months":
      return `${n.format(value)} ${value === 1 ? "mês" : "meses"}`;
    case "count":
      return n.format(value);
  }
}

export const badgeById = (id: string): BadgeDef | undefined => BADGES.find((b) => b.id === id);

/** A insígnia que toda conta ganha ao ser criada (Bronze), com as boas-vindas. */
export const WELCOME_BADGE_ID = "welcome";

// ===================================================================================================================
// Contrato da API
// ===================================================================================================================

export const badgeStateDTO = z.object({
  id: z.string(),
  /** O número que mede a insígnia (veja `METRIC_KEYS`), já calculado. */
  value: z.number(),
  /** Nível atual: 0 (ainda não ganhou nenhum) a 6 (Mestre). */
  level: z.number().int().min(0).max(6),
  /** Quando cada nível foi ganho (Bronze → Mestre); `null` = ainda não. */
  earnedAt: z.array(timestamp.nullable()).length(6),
  /** Níveis ganhos que a pessoa ainda não viu comemorados (números de 1 a 6). */
  unseen: z.array(z.number().int().min(1).max(6)),
});

export const badgesResponse = z.object({
  items: z.array(badgeStateDTO),
  summary: z.object({
    /** Insígnias com pelo menos o Bronze. */
    unlocked: z.number().int(),
    total: z.number().int(),
    /** Níveis ganhos somando todas as insígnias. */
    tiersEarned: z.number().int(),
    points: z.number().int(),
    /** Insígnias no nível Mestre. */
    masters: z.number().int(),
  }),
});

export const markBadgesSeenBody = z.strictObject({
  /** Insígnias cujas comemorações foram vistas. Vazio/ausente = todas. */
  ids: z.array(z.string().max(40)).max(100).optional(),
});

export type BadgeStateDTO = z.infer<typeof badgeStateDTO>;
export type BadgesResponse = z.infer<typeof badgesResponse>;
