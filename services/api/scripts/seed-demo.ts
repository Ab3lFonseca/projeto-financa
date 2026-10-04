// Cria um usuário de demonstração com 6 meses de dados realistas, usando a própria API
// (então exercita os fluxos reais: parcelas, faturas, orçamentos, metas, recorrências).
//
//   pnpm dev:seed            → cria (se ainda não existir)
//   pnpm dev:seed -- --reset → apaga a conta demo e recria
//
// Somente com AUTH_MODE=dev. Credenciais: demo@financa.dev / Demo@12345678
import { addDays, addMonths, endOfMonth, startOfMonth, todayIn, type ISODate } from "@app/shared";
import { config as loadDotenv } from "dotenv";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";

loadDotenv({ path: ["../../.env", ".env"], quiet: true });

const EMAIL = "demo@financa.dev";
const PASSWORD = "Demo@12345678";
const reset = process.argv.includes("--reset");

const config = loadConfig({ ...process.env, LOG_LEVEL: "warn", JOBS_ENABLED: "false", RATE_LIMIT_ENABLED: "false" });
if (config.AUTH_MODE !== "dev" || config.NODE_ENV === "production") {
  throw new Error("seed:demo só roda com AUTH_MODE=dev (nunca em produção).");
}
const app = await buildApp({ config });
await app.ready();

type Res = { status: number; body: any };
async function call(method: string, url: string, token: string | null, body?: unknown): Promise<Res> {
  const res = await app.inject({
    method: method as any,
    url,
    payload: body as any,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  let parsed: any = null;
  try {
    parsed = res.body ? res.json() : null;
  } catch {
    parsed = res.body;
  }
  return { status: res.statusCode, body: parsed };
}
function must(res: Res, what: string): any {
  if (res.status >= 300) throw new Error(`${what} falhou (${res.status}): ${JSON.stringify(res.body)}`);
  return res.body;
}

try {
  // ---- sessão
  let login = await call("POST", "/v1/auth/login", null, { email: EMAIL, password: PASSWORD });
  if (login.status === 200 && !reset) {
    console.log(`A conta demo já existe (${EMAIL}). Use --reset para recriar.`);
    await app.close();
    process.exit(0);
  }
  if (login.status === 200 && reset) {
    const token = login.body.accessToken;
    await call("GET", "/v1/me", token);
    must(await call("DELETE", "/v1/me", token, { password: PASSWORD, confirm: "EXCLUIR" }), "excluir conta demo");
    console.log("Conta demo anterior excluída.");
  }
  must(
    await call("POST", "/v1/auth/register", null, {
      email: EMAIL, password: PASSWORD, displayName: "Maria Demo", acceptTerms: true, acceptPrivacy: true,
      termsVersion: config.LEGAL_TERMS_VERSION, privacyVersion: config.LEGAL_PRIVACY_VERSION,
    }),
    "cadastro",
  );
  login = await call("POST", "/v1/auth/login", null, { email: EMAIL, password: PASSWORD });
  const token: string = must(login, "login").accessToken;
  const api = {
    get: async (u: string) => must(await call("GET", u, token), `GET ${u}`),
    post: async (u: string, b: unknown) => must(await call("POST", u, token, b), `POST ${u}`),
    put: async (u: string, b: unknown) => must(await call("PUT", u, token, b), `PUT ${u}`),
  };
  await api.get("/v1/me");
  await call("PATCH", "/v1/me", token, { onboardingCompleted: true });

  // ---- base
  const categories = (await api.get("/v1/categories")).data as any[];
  const cat = (key: string) => categories.find((c) => c.systemKey === key).id as string;
  const banks = (await api.get("/v1/banks")).data as any[];
  const bankId = (code: string) => banks.find((b) => b.compeCode === code)?.id ?? null;

  const today: ISODate = todayIn("America/Sao_Paulo");
  const todayDay = Number(today.slice(8, 10));
  const nubank = await api.post("/v1/accounts", { name: "Nubank", type: "DIGITAL", bankId: bankId("260"), openingBalanceCents: 0, color: "#8A05BE" });
  const itau = await api.post("/v1/accounts", { name: "Itaú Corrente", type: "CHECKING", bankId: bankId("341"), openingBalanceCents: 0, color: "#EC7000" });
  const wallet = await api.post("/v1/accounts", { name: "Carteira", type: "WALLET", openingBalanceCents: 0 });
  await api.post("/v1/accounts", { name: "Reserva (CDB)", type: "INVESTMENT", bankId: bankId("077"), openingBalanceCents: 1_200_000, includeInTotal: false });

  const card = await api.post("/v1/cards", {
    name: "Nubank Roxinho", brand: "MASTERCARD", last4: "4821", bankId: bankId("260"), limitCents: 1_200_000,
    closingDay: 28, dueDay: 6, payAccountId: nubank.id, color: "#8A05BE",
  });

  // ---- 6 meses de histórico
  const money = (reais: number) => Math.round(reais * 100);
  type Tx = { day: number; desc: string; reais: number; cat: string; acc?: string; pm?: string };
  const monthPlan: Tx[] = [
    { day: 5, desc: "Aluguel", reais: 1500, cat: "expense.housing", acc: nubank.id, pm: "PIX" },
    { day: 3, desc: "Supermercado Pão de Açúcar", reais: 380, cat: "expense.groceries", acc: itau.id, pm: "DEBIT" },
    { day: 9, desc: "Feira e hortifruti", reais: 160, cat: "expense.groceries", acc: wallet.id, pm: "CASH" },
    { day: 14, desc: "Atacadão", reais: 220, cat: "expense.groceries", acc: itau.id, pm: "DEBIT" },
    { day: 22, desc: "Padaria e mercadinho", reais: 340, cat: "expense.groceries", acc: nubank.id, pm: "PIX" },
    { day: 2, desc: "Almoço de trabalho", reais: 68, cat: "expense.food", acc: nubank.id, pm: "PIX" },
    { day: 7, desc: "iFood — jantar", reais: 94, cat: "expense.food", acc: nubank.id, pm: "PIX" },
    { day: 12, desc: "Pizzaria", reais: 118, cat: "expense.food", acc: itau.id, pm: "DEBIT" },
    { day: 18, desc: "Café da tarde", reais: 42, cat: "expense.food", acc: wallet.id, pm: "CASH" },
    { day: 24, desc: "Restaurante japonês", reais: 198, cat: "expense.food", acc: nubank.id, pm: "PIX" },
    { day: 4, desc: "Uber", reais: 86, cat: "expense.transport", acc: nubank.id, pm: "PIX" },
    { day: 11, desc: "Combustível", reais: 240, cat: "expense.transport", acc: itau.id, pm: "DEBIT" },
    { day: 20, desc: "Estacionamento e pedágio", reais: 104, cat: "expense.transport", acc: wallet.id, pm: "CASH" },
    { day: 8, desc: "Cinema", reais: 78, cat: "expense.leisure", acc: nubank.id, pm: "PIX" },
    { day: 15, desc: "Show", reais: 120, cat: "expense.leisure", acc: itau.id, pm: "DEBIT" },
    { day: 25, desc: "Bar com amigos", reais: 82, cat: "expense.leisure", acc: wallet.id, pm: "CASH" },
    { day: 6, desc: "Farmácia", reais: 130, cat: "expense.health", acc: itau.id, pm: "DEBIT" },
    { day: 16, desc: "Consulta", reais: 150, cat: "expense.health", acc: nubank.id, pm: "PIX" },
  ];
  // total/mês = 4.110 + assinaturas no cartão (Netflix 55,90 + Spotify 21,90 + iCloud 14,90 + Academia 47,30 = 140,00)
  //           + 600 de parcelas (notebook 300 + passagens 300) = 4.850

  const months = Array.from({ length: 6 }, (_, i) => addMonths(startOfMonth(today), i - 5));
  for (const [i, monthStart] of months.entries()) {
    const isCurrent = i === 5;
    const clampDay = (day: number) => (isCurrent ? Math.max(1, Math.min(day, todayDay)) : day);
    const date = (day: number): ISODate => {
      const d = Math.min(clampDay(day), Number(endOfMonth(monthStart).slice(8, 10)));
      return `${monthStart.slice(0, 8)}${String(d).padStart(2, "0")}`;
    };
    await api.post("/v1/transactions", {
      type: "INCOME", description: "Salário", amountCents: money(7200), occurredOn: date(1), accountId: itau.id,
      categoryId: cat("income.salary"), paymentMethod: "TED_DOC", status: "POSTED",
    });
    if (i % 2 === 0) {
      await api.post("/v1/transactions", {
        type: "INCOME", description: "Projeto freelance", amountCents: money(650 + i * 40), occurredOn: date(18), accountId: nubank.id,
        categoryId: cat("income.freelance"), paymentMethod: "PIX", status: "POSTED",
      });
    }
    for (const t of monthPlan) {
      // pequena variação mês a mês para os gráficos não ficarem planos (o mês atual é fixo)
      const wiggle = isCurrent ? 1 : 1 + (((i * 7 + t.day) % 9) - 4) / 40;
      await api.post("/v1/transactions", {
        type: "EXPENSE", description: t.desc, amountCents: money(Math.round(t.reais * wiggle)), occurredOn: date(t.day),
        accountId: t.acc, categoryId: cat(t.cat), paymentMethod: t.pm, status: "POSTED",
      });
    }
    for (const [desc, reais, day] of [["Netflix", 55.9, 12], ["Spotify", 21.9, 14], ["iCloud", 14.9, 16], ["Academia", 47.3, 3]] as const) {
      await api.post("/v1/transactions", {
        type: "EXPENSE", description: desc, amountCents: money(reais), occurredOn: date(day), cardId: card.id,
        categoryId: cat("expense.subscriptions"),
      });
    }
  }

  // compras parceladas no cartão
  await api.post("/v1/transactions", {
    type: "EXPENSE", description: "Notebook Dell", amountCents: money(3000), occurredOn: addDays(today, -35), cardId: card.id,
    categoryId: cat("expense.shopping"), installments: 10,
  });
  await api.post("/v1/transactions", {
    type: "EXPENSE", description: "Passagens aéreas — Florianópolis", amountCents: money(900), occurredOn: addDays(today, -12), cardId: card.id,
    categoryId: cat("expense.travel"), installments: 3,
  });

  // conta a pagar (pendente) e recorrências futuras
  await api.post("/v1/transactions", {
    type: "EXPENSE", description: "Conta de luz", amountCents: money(189.9), occurredOn: addDays(today, 2), accountId: itau.id,
    categoryId: cat("expense.bills"), paymentMethod: "BOLETO",
  });
  const nextMonth = addMonths(startOfMonth(today), 1);
  const rule = (over: Record<string, unknown>) => api.post("/v1/recurring", { type: "EXPENSE", frequency: "MONTHLY", ...over });
  await rule({ description: "Aluguel", amountCents: money(1500), accountId: nubank.id, categoryId: cat("expense.housing"), paymentMethod: "PIX", startDate: `${nextMonth.slice(0, 8)}05` });
  await rule({ description: "Internet", amountCents: money(119.9), accountId: itau.id, categoryId: cat("expense.bills"), paymentMethod: "BOLETO", startDate: addDays(today, 3) });
  await rule({ type: "INCOME", description: "Salário", amountCents: money(7200), accountId: itau.id, categoryId: cat("income.salary"), paymentMethod: "TED_DOC", startDate: `${nextMonth.slice(0, 8)}01` });

  // ---- orçamentos do mês e metas
  const month = startOfMonth(today);
  for (const [key, reais] of [["expense.food", 1000], ["expense.transport", 500], ["expense.leisure", 400], ["expense.groceries", 2000], ["expense.housing", 1600]] as const) {
    await api.post("/v1/budgets", { categoryId: cat(key), month, amountCents: money(reais) });
  }
  await api.post("/v1/goals", { name: "Comprar carro", kind: "VEHICLE", targetCents: money(50_000), initialCents: money(18_500), deadline: addMonths(today, 30) });
  await api.post("/v1/goals", { name: "Reserva de emergência", kind: "EMERGENCY_FUND", targetCents: money(20_000), initialCents: money(8_000) });
  await api.post("/v1/goals", { name: "Viagem à Europa", kind: "TRAVEL", targetCents: money(6_000), initialCents: money(4_800), deadline: addMonths(today, 8) });

  // ---- ajusta os saldos iniciais: contas com saldos realistas e total em R$ 8.540,00 (saldos "de vitrine")
  const targets = new Map<string, number>([
    [nubank.id, money(3_200)],
    [wallet.id, money(420)],
    [itau.id, money(8_540) - money(3_200) - money(420)], // o resto fica na conta corrente
  ]);
  const current = (await api.get("/v1/accounts")).data as any[];
  for (const [id, target] of targets) {
    const acc = current.find((a) => a.id === id);
    await api.put(`/v1/accounts/${id}`, { openingBalanceCents: acc.openingBalanceCents + (target - acc.balanceCents) });
  }

  const final = await api.get("/v1/dashboard");
  console.log("\nConta demo criada ✔");
  console.log(`  e-mail: ${EMAIL}\n  senha:  ${PASSWORD}`);
  console.log(`  saldo total: R$ ${(final.totalBalanceCents / 100).toFixed(2)}`);
  console.log(`  mês: receitas R$ ${(final.month.incomeCents / 100).toFixed(2)} · despesas R$ ${(final.month.expenseCents / 100).toFixed(2)} · economia R$ ${(final.month.savingsCents / 100).toFixed(2)}`);
  console.log(`  insights: ${final.insights.length} · alertas de orçamento: ${final.budgetAlerts.length}\n`);
} finally {
  await app.close();
}
