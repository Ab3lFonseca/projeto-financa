import type { FastifyInstance } from "fastify";
import { Errors } from "../lib/errors";

/** Hooks de autenticação/autorização. Registrado direto no app raiz (decorators globais). */
export function registerAuthHooks(app: FastifyInstance): void {
  app.decorateRequest("user", null);
  app.decorateRequest("accessToken", null);

  app.decorate("authenticate", async (req) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) throw Errors.unauthorized("Token ausente");
    const token = header.slice(7).trim();
    if (!token || token.length > 4096) throw Errors.unauthorized("Token inválido", "INVALID_TOKEN");

    const claims = await app.tokenVerifier.verify(token);
    req.accessToken = token;
    req.user = await app.users.resolve(claims);
    // Toda linha de log desta requisição passa a carregar o id (pseudônimo) do usuário: é o que
    // permite reconstituir "o que aconteceu com esta conta" ao investigar um erro.
    req.log = req.log.child({ uid: req.user.id });
  });

  // Dados financeiros só são liberados depois do aceite da versão vigente de Termos e Privacidade.
  app.decorate("requireConsent", async (req) => {
    if (!req.user?.consentOk) {
      throw Errors.forbidden(
        "Aceite os Termos de Uso e a Política de Privacidade para continuar",
        "CONSENT_REQUIRED",
      );
    }
  });

  // Depois do teste grátis e sem assinatura o app fica SOMENTE LEITURA: consultar e exportar continuam (a pessoa não perde os dados),
  // criar e editar respondem 402 SUBSCRIPTION_REQUIRED. Administradores, cortesias, assinantes e o beta nunca caem aqui.
  const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
  app.decorate("requireActiveAccess", async (req) => {
    if (SAFE_METHODS.has(req.method) || req.user?.access.allowed) return;
    // Marcar notificação como lida não é editar dados.
    if (req.routeOptions.url?.startsWith("/v1/notifications")) return;
    throw Errors.subscriptionRequired();
  });

  app.decorate("requireAdmin", async (req) => {
    if (req.user?.role !== "ADMIN") throw Errors.forbidden("Acesso restrito a administradores");
  });
}
