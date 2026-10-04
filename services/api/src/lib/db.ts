import { withUser, type Prisma } from "@app/database";
import type { FastifyRequest } from "fastify";
import type { AuthUser } from "../types";
import { Errors } from "./errors";

export type Tx = Prisma.TransactionClient;

/** Contexto da operação: permite agendar efeitos colaterais para DEPOIS do commit (ex.: push). */
export type OpCtx = {
  afterCommit(fn: () => Promise<void> | void): void;
};

export function requireUser(req: FastifyRequest): AuthUser {
  if (!req.user) throw Errors.unauthorized();
  return req.user;
}

async function flush(req: FastifyRequest, callbacks: Array<() => Promise<void> | void>): Promise<void> {
  for (const cb of callbacks) {
    try {
      await cb();
    } catch (err) {
      req.log.error({ err }, "falha em ação pós-commit");
    }
  }
}

/**
 * Executa `fn` numa transação com RLS ativo em nome do usuário da requisição.
 * Qualquer consulta que esqueça o filtro por user_id ainda assim só enxerga dados dele.
 */
export async function runAs<T>(req: FastifyRequest, fn: (tx: Tx, user: AuthUser, ctx: OpCtx) => Promise<T>): Promise<T> {
  const user = requireUser(req);
  const callbacks: Array<() => Promise<void> | void> = [];
  const ctx: OpCtx = { afterCommit: (cb) => void callbacks.push(cb) };
  const result = await withUser(req.server.prisma, user.id, (tx) => fn(tx, user, ctx));
  await flush(req, callbacks);
  return result;
}

const KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Como `runAs`, mas honra o cabeçalho `Idempotency-Key` (fila offline do app):
 * a chave é gravada na mesma transação da operação. Repetir a chave retorna
 * 409 ALREADY_PROCESSED, sem repetir a operação. O app trata isso como sucesso.
 */
export async function runMutation<T>(
  req: FastifyRequest,
  fn: (tx: Tx, user: AuthUser, ctx: OpCtx) => Promise<T>,
): Promise<T> {
  const user = requireUser(req);
  const raw = req.headers["idempotency-key"];
  const key = Array.isArray(raw) ? raw[0] : raw;
  if (key !== undefined && !KEY_RE.test(key)) {
    throw Errors.badRequest("Idempotency-Key inválida (8–64 caracteres: letras, números, _ e -)");
  }
  const callbacks: Array<() => Promise<void> | void> = [];
  const ctx: OpCtx = { afterCommit: (cb) => void callbacks.push(cb) };

  const result = await withUser(req.server.prisma, user.id, async (tx) => {
    if (key) {
      const exists = await tx.idempotencyKey.findUnique({
        where: { userId_key: { userId: user.id, key } },
        select: { key: true },
      });
      if (exists) throw Errors.conflict("Operação já processada", "ALREADY_PROCESSED");
      await tx.idempotencyKey.create({ data: { userId: user.id, key } });
    }
    return fn(tx, user, ctx);
  });
  await flush(req, callbacks);
  return result;
}
