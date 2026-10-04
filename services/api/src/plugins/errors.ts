import { Prisma } from "@app/database";
import type { FastifyError, FastifyInstance } from "fastify";
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from "fastify-type-provider-zod";
import { AppError } from "../lib/errors";

type ErrorBody = { error: { code: string; message: string; details?: unknown; requestId: string } };

function validationDetails(err: { validation?: unknown; validationContext?: string }): {
  in: string;
  path: string;
  message: string;
}[] {
  const items = Array.isArray(err.validation) ? err.validation : [];
  return items.map((v: any) => ({
    in: err.validationContext ?? "body",
    path: String(v.instancePath ?? "").replace(/^\//, "").replaceAll("/", "."),
    message: String(v.message ?? "Valor inválido"),
  }));
}

/** Mapeia qualquer erro para o formato único da API, sem vazar detalhes internos. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((req, reply) => {
    const body: ErrorBody = {
      error: { code: "NOT_FOUND", message: "Rota não encontrada", requestId: String(req.id) },
    };
    return reply.code(404).send(body);
  });

  app.setErrorHandler((err: FastifyError | AppError | Error, req, reply) => {
    const requestId = String(req.id);
    const send = (status: number, code: string, message: string, details?: unknown) => {
      const body: ErrorBody = { error: { code, message, requestId, ...(details === undefined ? {} : { details }) } };
      return reply.code(status).send(body);
    };

    if (err instanceof AppError) {
      if (err.status >= 500) req.log.error({ err }, "erro de aplicação");
      // Recusas (401/403/404/409/422...) ficam no log com o código estável, sem dados do usuário.
      else req.log.info({ code: err.code, status: err.status }, "requisição recusada");
      return send(err.status, err.code, err.message, err.details);
    }

    if (hasZodFastifySchemaValidationErrors(err)) {
      const details = validationDetails(err);
      // Só os NOMES dos campos inválidos (nunca os valores enviados).
      req.log.info({ code: "VALIDATION_ERROR", status: 422, fields: details.map((d) => d.path) }, "requisição recusada");
      return send(422, "VALIDATION_ERROR", "Dados inválidos", details);
    }

    if (isResponseSerializationError(err)) {
      // Bug nosso: a resposta não bate com o contrato. Nunca devolver o dado inválido.
      req.log.error({ err }, "resposta fora do contrato");
      return send(500, "INTERNAL", "Erro interno");
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      switch (err.code) {
        case "P2002":
          return send(409, "CONFLICT", "Registro já existe");
        case "P2025":
          return send(404, "NOT_FOUND", "Registro não encontrado");
        case "P2003":
          return send(409, "REFERENCE_ERROR", "Operação conflita com registros relacionados");
        default:
          req.log.error({ err }, "erro de banco");
          return send(500, "INTERNAL", "Erro interno");
      }
    }

    const fastifyErr = err as FastifyError;
    const status = typeof fastifyErr.statusCode === "number" ? fastifyErr.statusCode : 500;

    if (status === 429) return send(429, "RATE_LIMITED", "Muitas requisições. Tente novamente em instantes.");
    if (status === 413) return send(413, "PAYLOAD_TOO_LARGE", "Requisição grande demais");
    if (status === 415) return send(415, "UNSUPPORTED_MEDIA_TYPE", "Tipo de conteúdo não suportado");
    if (status >= 400 && status < 500) {
      // JSON malformado, etc. (mensagem genérica; não repassamos texto do parser)
      return send(400, "BAD_REQUEST", "Requisição inválida");
    }

    req.log.error({ err }, "erro não tratado");
    return send(500, "INTERNAL", "Erro interno");
  });
}
