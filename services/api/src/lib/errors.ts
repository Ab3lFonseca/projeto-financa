/** Erro de aplicação com código estável (o app mobile decide o que mostrar pelo `code`). */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  badRequest: (message = "Requisição inválida", details?: unknown) => new AppError(400, "BAD_REQUEST", message, details),
  validation: (details: unknown, message = "Dados inválidos") => new AppError(422, "VALIDATION_ERROR", message, details),
  unauthorized: (message = "Autenticação necessária", code = "UNAUTHORIZED") => new AppError(401, code, message),
  forbidden: (message = "Acesso negado", code = "FORBIDDEN") => new AppError(403, code, message),
  notFound: (what = "Recurso") => new AppError(404, "NOT_FOUND", `${what} não encontrado`),
  conflict: (message: string, code = "CONFLICT", details?: unknown) => new AppError(409, code, message, details),
  planLimit: (message: string, details?: unknown) => new AppError(402, "PLAN_LIMIT_REACHED", message, details),
  unprocessable: (message: string, code = "UNPROCESSABLE", details?: unknown) => new AppError(422, code, message, details),
  tooMany: (message = "Muitas requisições. Tente novamente em instantes.") => new AppError(429, "RATE_LIMITED", message),
  upstream: (message = "Serviço externo indisponível", code = "UPSTREAM_ERROR") => new AppError(502, code, message),
  unavailable: (message = "Serviço indisponível", code = "UNAVAILABLE") => new AppError(503, code, message),
};

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
