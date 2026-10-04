import type { AccountDTO, BankDTO } from "@app/shared";
import { todayIn } from "@app/shared";
import { accountBalances } from "../../lib/balances";
import { dateOut, num, tsOut } from "../../lib/dto";
import type { Tx } from "../../lib/db";

type BankRow = { id: string; compeCode: string | null; name: string; shortName: string | null; logoUrl: string | null };

export function toBankDTO(b: BankRow | null): BankDTO | null {
  if (!b) return null;
  return { id: b.id, compeCode: b.compeCode, name: b.name, shortName: b.shortName, logoUrl: b.logoUrl };
}

type AccountRow = {
  id: string;
  name: string;
  type: AccountDTO["type"];
  currency: string;
  color: string | null;
  icon: string | null;
  includeInTotal: boolean;
  source: AccountDTO["source"];
  openingBalanceCents: bigint;
  archivedAt: Date | null;
  createdAt: Date;
  bank: BankRow | null;
};

export function toAccountDTO(a: AccountRow, balanceCents: number): AccountDTO {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    bank: toBankDTO(a.bank),
    currency: a.currency,
    color: a.color,
    icon: a.icon,
    includeInTotal: a.includeInTotal,
    source: a.source,
    openingBalanceCents: num(a.openingBalanceCents),
    balanceCents,
    archived: a.archivedAt !== null,
    createdAt: tsOut(a.createdAt),
  };
}

export const accountInclude = {
  bank: { select: { id: true, compeCode: true, name: true, shortName: true, logoUrl: true } },
} as const;

export async function listAccountDTOs(
  tx: Tx,
  userId: string,
  timezone: string,
  now: Date,
  opts: { includeArchived?: boolean; ids?: string[] } = {},
): Promise<AccountDTO[]> {
  const rows = await tx.account.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(opts.includeArchived ? {} : { archivedAt: null }),
      ...(opts.ids ? { id: { in: opts.ids } } : {}),
    },
    include: accountInclude,
    orderBy: [{ createdAt: "asc" }],
  });
  const balances = await accountBalances(tx, userId, todayIn(timezone, now), rows.map((r) => r.id));
  return rows.map((r) => toAccountDTO(r, balances.get(r.id) ?? num(r.openingBalanceCents)));
}

export { dateOut };
