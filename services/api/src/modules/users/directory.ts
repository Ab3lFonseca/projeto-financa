import { Prisma, seedDefaultCategories, type PrismaClient } from "@app/database";
import type { Config } from "../../config";
import { planOf, resolveAccess } from "../../lib/access";
import { accessConfigOf, subscriptionAccessSelect } from "../../lib/access-db";
import { audit } from "../../lib/audit";
import { Errors } from "../../lib/errors";
import type { AuthUser } from "../../types";
import type { VerifiedToken } from "../auth/token-verifier";

type CacheEntry = { user: AuthUser; expiresAt: number };

const TOUCH_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Resolve o usuário local a partir do token verificado:
 *  - provisiona a conta local no primeiro acesso (perfil, plano FREE, categorias padrão, aceites);
 *  - bloqueia contas suspensas ou em exclusão;
 *  - calcula plano efetivo e se os aceites legais estão em dia.
 *
 * Mantém um cache curto em memória para não consultar o banco a cada requisição.
 * Mudanças feitas por esta instância invalidam o cache na hora; em múltiplas instâncias,
 * outras podem demorar até `ttlMs` para enxergar (suspensão, plano, aceites).
 */
export class UserDirectory {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: Config,
    private readonly now: () => Date = () => new Date(),
    private readonly ttlMs = 30_000,
  ) {}

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  async resolve(claims: VerifiedToken): Promise<AuthUser> {
    const nowMs = this.now().getTime();
    const hit = this.cache.get(claims.sub);
    if (hit && hit.expiresAt > nowMs) return hit.user;

    let row = await this.load(claims.sub);
    if (!row) {
      // Conta excluída (LGPD): o JWT antigo continua válido até expirar, mas não pode "ressuscitar"
      // a conta local. A auditoria `account.deleted` serve de marcador.
      const erased = await this.prisma.auditLog.findFirst({
        where: { action: "account.deleted", entityId: claims.sub },
        select: { id: true },
      });
      if (erased) throw Errors.unauthorized("Esta conta foi excluída", "ACCOUNT_DELETED");
      await this.provision(claims);
      row = await this.load(claims.sub);
      if (!row) throw Errors.unavailable("Não foi possível criar a conta local", "PROVISIONING_FAILED");
    }

    if (row.status === "SUSPENDED") {
      throw Errors.forbidden("Conta suspensa. Entre em contato com o suporte.", "ACCOUNT_SUSPENDED");
    }
    if (row.status === "DELETING") {
      throw Errors.forbidden("Conta em processo de exclusão.", "ACCOUNT_DELETING");
    }

    // Administradores definidos na configuração (ADMIN_USER_IDS): promove na primeira vez em que a conta é vista.
    if (row.role !== "ADMIN" && this.config.ADMIN_USER_IDS.includes(row.id)) {
      await this.prisma.user.update({ where: { id: row.id }, data: { role: "ADMIN" } });
      row = { ...row, role: "ADMIN" };
      await audit(this.prisma, this.config.IP_HASH_PEPPER, { action: "admin.bootstrap", entity: "user", entityId: row.id });
    }

    if (claims.email && claims.email !== row.email) {
      // E-mail alterado no provedor: mantém o espelho local em dia (melhor esforço).
      await this.prisma.user.update({ where: { id: row.id }, data: { email: claims.email } }).catch(() => undefined);
    }

    const accepted = new Set(row.consents.filter((c) => this.isCurrent(c.type, c.version)).map((c) => c.type));
    const access = resolveAccess({ role: row.role, createdAt: row.createdAt, subscription: row.subscription, config: accessConfigOf(this.config), now: this.now() });
    const user: AuthUser = {
      id: row.id,
      email: claims.email ?? row.email,
      role: row.role,
      plan: planOf(access),
      access,
      timezone: row.profile?.timezone ?? "America/Sao_Paulo",
      consentOk: accepted.has("TERMS") && accepted.has("PRIVACY"),
    };
    this.cache.set(claims.sub, { user, expiresAt: nowMs + this.ttlMs });

    if (!row.lastSeenAt || nowMs - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      void this.prisma.user.update({ where: { id: row.id }, data: { lastSeenAt: this.now() } }).catch(() => undefined);
    }
    return user;
  }

  private isCurrent(type: string, version: string): boolean {
    if (type === "TERMS") return version === this.config.LEGAL_TERMS_VERSION;
    if (type === "PRIVACY") return version === this.config.LEGAL_PRIVACY_VERSION;
    return false;
  }

  private load(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        lastSeenAt: true,
        createdAt: true,
        profile: { select: { timezone: true } },
        subscription: { select: subscriptionAccessSelect },
        consents: {
          where: { type: { in: ["TERMS", "PRIVACY"] }, revokedAt: null },
          select: { type: true, version: true },
        },
      },
    });
  }

  /** Cria a conta local. Concorrência: se outra requisição já criou, ignora. */
  private async provision(claims: VerifiedToken): Promise<void> {
    if (!claims.email) throw Errors.unauthorized("Conta sem e-mail", "EMAIL_MISSING");
    const meta = claims.userMetadata;
    const displayName = typeof meta.display_name === "string" ? meta.display_name.slice(0, 100) : null;
    const accepted = this.acceptedAt(meta.accepted_at);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.create({ data: { id: claims.sub, email: claims.email! } });
        await tx.profile.create({ data: { userId: claims.sub, displayName } });
        await tx.subscription.create({ data: { userId: claims.sub } });
        await seedDefaultCategories(tx, claims.sub);

        const consents: Prisma.ConsentCreateManyInput[] = [];
        if (typeof meta.terms_version === "string") {
          consents.push({ userId: claims.sub, type: "TERMS", version: meta.terms_version.slice(0, 32), grantedAt: accepted });
        }
        if (typeof meta.privacy_version === "string") {
          consents.push({ userId: claims.sub, type: "PRIVACY", version: meta.privacy_version.slice(0, 32), grantedAt: accepted });
        }
        if (meta.marketing_opt_in === true) {
          consents.push({ userId: claims.sub, type: "MARKETING", version: this.config.LEGAL_PRIVACY_VERSION, grantedAt: accepted });
        }
        if (consents.length > 0) await tx.consent.createMany({ data: consents });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // Corrida (outra requisição criou) ou e-mail já usado por outra conta local.
        const exists = await this.prisma.user.findUnique({ where: { id: claims.sub }, select: { id: true } });
        if (exists) return;
        throw Errors.conflict("Já existe uma conta com este e-mail", "ACCOUNT_CONFLICT");
      }
      throw err;
    }
  }

  /** Data do aceite gravada no cadastro, se plausível (últimos 30 dias); senão, agora. */
  private acceptedAt(value: unknown): Date {
    const now = this.now();
    if (typeof value !== "string") return now;
    const date = new Date(value);
    const ageMs = now.getTime() - date.getTime();
    return Number.isNaN(date.getTime()) || ageMs < 0 || ageMs > 30 * 86_400_000 ? now : date;
  }
}
