// Dados de catálogo (sem dependência do Prisma): categorias padrão e bancos.
// Importável pela API, pelo seed e por testes sem precisar do client gerado.

export type DefaultCategory = {
  /** Chave estável (não muda se o nome for editado pelo usuário). */
  systemKey: string;
  type: "EXPENSE" | "INCOME";
  name: string;
  /** Nome do ícone no conjunto Lucide. */
  icon: string;
  /** Cor em hex (#RRGGBB). */
  color: string;
  sortOrder: number;
};

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  // Despesas
  { systemKey: "expense.food", type: "EXPENSE", name: "Alimentação", icon: "utensils", color: "#F97316", sortOrder: 10 },
  { systemKey: "expense.groceries", type: "EXPENSE", name: "Mercado", icon: "shopping-cart", color: "#84CC16", sortOrder: 20 },
  { systemKey: "expense.transport", type: "EXPENSE", name: "Transporte", icon: "car", color: "#3B82F6", sortOrder: 30 },
  { systemKey: "expense.housing", type: "EXPENSE", name: "Moradia", icon: "house", color: "#8B5CF6", sortOrder: 40 },
  { systemKey: "expense.health", type: "EXPENSE", name: "Saúde", icon: "heart-pulse", color: "#EC4899", sortOrder: 50 },
  { systemKey: "expense.education", type: "EXPENSE", name: "Educação", icon: "graduation-cap", color: "#06B6D4", sortOrder: 60 },
  { systemKey: "expense.leisure", type: "EXPENSE", name: "Lazer", icon: "party-popper", color: "#F59E0B", sortOrder: 70 },
  { systemKey: "expense.shopping", type: "EXPENSE", name: "Compras", icon: "shopping-bag", color: "#D946EF", sortOrder: 80 },
  { systemKey: "expense.subscriptions", type: "EXPENSE", name: "Assinaturas", icon: "repeat", color: "#6366F1", sortOrder: 90 },
  { systemKey: "expense.travel", type: "EXPENSE", name: "Viagens", icon: "plane", color: "#14B8A6", sortOrder: 100 },
  { systemKey: "expense.bills", type: "EXPENSE", name: "Contas", icon: "receipt", color: "#64748B", sortOrder: 110 },
  { systemKey: "expense.other", type: "EXPENSE", name: "Outros", icon: "ellipsis", color: "#94A3B8", sortOrder: 120 },
  // Receitas
  { systemKey: "income.salary", type: "INCOME", name: "Salário", icon: "briefcase", color: "#22C55E", sortOrder: 10 },
  { systemKey: "income.freelance", type: "INCOME", name: "Freelance", icon: "laptop", color: "#10B981", sortOrder: 20 },
  { systemKey: "income.investments", type: "INCOME", name: "Investimentos", icon: "trending-up", color: "#0EA5E9", sortOrder: 30 },
  { systemKey: "income.sales", type: "INCOME", name: "Vendas", icon: "tag", color: "#A3E635", sortOrder: 40 },
  { systemKey: "income.other", type: "INCOME", name: "Outros", icon: "ellipsis", color: "#94A3B8", sortOrder: 50 },
] as const;

export type BankSeed = { compeCode: string; name: string; shortName: string };

/**
 * Catálogo inicial de bancos (código COMPE). É editável e NÃO é exaustivo:
 * validar contra a lista oficial do Banco Central antes do lançamento.
 */
export const BANKS: readonly BankSeed[] = [
  { compeCode: "001", name: "Banco do Brasil", shortName: "Banco do Brasil" },
  { compeCode: "033", name: "Banco Santander (Brasil)", shortName: "Santander" },
  { compeCode: "041", name: "Banrisul", shortName: "Banrisul" },
  { compeCode: "070", name: "BRB - Banco de Brasília", shortName: "BRB" },
  { compeCode: "077", name: "Banco Inter", shortName: "Inter" },
  { compeCode: "102", name: "XP Investimentos", shortName: "XP" },
  { compeCode: "104", name: "Caixa Econômica Federal", shortName: "Caixa" },
  { compeCode: "197", name: "Stone Pagamentos", shortName: "Stone" },
  { compeCode: "208", name: "Banco BTG Pactual", shortName: "BTG Pactual" },
  { compeCode: "212", name: "Banco Original", shortName: "Original" },
  { compeCode: "237", name: "Bradesco", shortName: "Bradesco" },
  { compeCode: "260", name: "Nu Pagamentos (Nubank)", shortName: "Nubank" },
  { compeCode: "290", name: "PagBank (PagSeguro)", shortName: "PagBank" },
  { compeCode: "323", name: "Mercado Pago", shortName: "Mercado Pago" },
  { compeCode: "336", name: "Banco C6", shortName: "C6 Bank" },
  { compeCode: "341", name: "Itaú Unibanco", shortName: "Itaú" },
  { compeCode: "380", name: "PicPay", shortName: "PicPay" },
  { compeCode: "403", name: "Cora", shortName: "Cora" },
  { compeCode: "422", name: "Banco Safra", shortName: "Safra" },
  { compeCode: "655", name: "Banco Votorantim (BV)", shortName: "BV" },
  { compeCode: "735", name: "Neon", shortName: "Neon" },
  { compeCode: "748", name: "Sicredi", shortName: "Sicredi" },
  { compeCode: "756", name: "Sicoob", shortName: "Sicoob" },
] as const;
