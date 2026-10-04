import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import { AppError } from "../lib/errors";

/** Cabeçalhos de segurança, CORS restrito e limite de taxa por IP (camada geral). */
export async function registerSecurity(app: FastifyInstance): Promise<void> {
  const { config } = app;

  await app.register(helmet, {
    // API JSON: nada de conteúdo ativo; CSP "default-src 'none'" é seguro aqui.
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: "same-site" },
    referrerPolicy: { policy: "no-referrer" },
    hsts: config.NODE_ENV === "production" ? { maxAge: 63_072_000, includeSubDomains: true, preload: false } : false,
  });

  await app.register(cors, {
    // Sem origens configuradas, CORS fica desativado (o app nativo não precisa).
    origin: config.CORS_ORIGINS.length > 0 ? config.CORS_ORIGINS : false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type", "idempotency-key", "x-request-id"],
    exposedHeaders: ["x-request-id", "retry-after"],
    maxAge: 600,
  });

  if (config.RATE_LIMIT_ENABLED) {
    await app.register(rateLimit, {
      global: true,
      // Roda no preHandler, depois da autenticação: usuários autenticados são limitados
      // por conta (redes móveis/CGNAT concentram muitos usuários num IP); anônimos, por IP.
      hook: "preHandler",
      keyGenerator: (req) => (req.user ? `u:${req.user.id}` : `ip:${req.ip}`),
      max: (req) => (req.user ? config.RATE_LIMIT_MAX : Math.max(10, Math.floor(config.RATE_LIMIT_MAX / 2))),
      timeWindow: "1 minute",
      allowList: (req) => req.url === "/health" || req.url === "/ready",
      errorResponseBuilder: (_req, ctx) =>
        new AppError(429, "RATE_LIMITED", "Muitas requisições. Tente novamente em instantes.", {
          retryAfterSeconds: Math.ceil(ctx.ttl / 1000),
        }),
    });
  }
}
