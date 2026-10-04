// Cadastra (uma única vez por ambiente) o webhook do Pluggy apontando para a nossa API.
// O Pluggy passa a enviar o cabeçalho `x-webhook-secret` em toda chamada; a API só aceita
// requisições com esse segredo (veja modules/open-finance/pluggy.ts → verifyWebhook).
//
//   pnpm --filter @app/api pluggy:webhook -- https://api.seudominio.com.br/v1/webhooks/pluggy
//
// Variáveis lidas do ambiente/.env: PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, PLUGGY_WEBHOOK_SECRET
// (e opcionalmente PLUGGY_BASE_URL). Para listar/remover webhooks use o painel do Pluggy.
// Documentação: https://docs.pluggy.ai/reference/webhooks-create
import { config as loadDotenv } from "dotenv";
import { WEBHOOK_SECRET_HEADER } from "../src/modules/open-finance/pluggy";

loadDotenv({ path: ["../../.env", ".env"], quiet: true });

const url = process.argv.slice(2).find((a) => !a.startsWith("-"));
const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, PLUGGY_WEBHOOK_SECRET } = process.env;
const baseUrl = (process.env.PLUGGY_BASE_URL ?? "https://api.pluggy.ai").replace(/\/+$/, "");

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!url) fail("Informe a URL pública (HTTPS) do webhook. Ex.: https://api.seudominio.com.br/v1/webhooks/pluggy");
if (!/^https:\/\//.test(url)) fail("O Pluggy exige HTTPS e um domínio público (localhost e IPs privados são recusados).");
if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) fail("Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.");
if (!PLUGGY_WEBHOOK_SECRET || PLUGGY_WEBHOOK_SECRET.length < 24) fail("Defina PLUGGY_WEBHOOK_SECRET com pelo menos 24 caracteres (ex.: openssl rand -hex 32).");

const auth = await fetch(`${baseUrl}/auth`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ clientId: PLUGGY_CLIENT_ID, clientSecret: PLUGGY_CLIENT_SECRET }),
});
if (!auth.ok) fail(`Falha ao autenticar no Pluggy (HTTP ${auth.status}). Confira o client id/secret.`);
const { apiKey } = (await auth.json()) as { apiKey: string };

// "all" recebe todos os eventos; a API processa só os de item e de transações e ignora o resto.
const res = await fetch(`${baseUrl}/webhooks`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-api-key": apiKey },
  body: JSON.stringify({ url, event: "all", headers: { [WEBHOOK_SECRET_HEADER]: PLUGGY_WEBHOOK_SECRET } }),
});
if (!res.ok) fail(`O Pluggy recusou o cadastro (HTTP ${res.status}).`);
const created = (await res.json()) as { id?: string };
console.log(`✓ Webhook cadastrado${created.id ? ` (id ${created.id})` : ""}: ${url}`);
console.log("  Eventos repetidos são ignorados pela API (idempotência por eventId).");
