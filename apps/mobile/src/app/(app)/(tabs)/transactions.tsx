import { PAYMENT_METHOD_LABEL_PT, type ISODate } from "@app/shared";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { SectionList, View } from "react-native";
import { Fab, PendingSyncBanner } from "@/components/feature/Common";
import { TransactionRow } from "@/components/feature/Rows";
import { IconButton } from "@/components/ui/Button";
import { Chip, ChipRow, Segmented } from "@/components/ui/Controls";
import { DateField } from "@/components/ui/DateField";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { TextField } from "@/components/ui/Inputs";
import { Card, Row, Screen } from "@/components/ui/Layout";
import { Money } from "@/components/ui/Money";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/Icon";
import type { Transaction, TransactionFilters } from "@/lib/api/endpoints";
import { formatDayHeader } from "@/lib/format";
import { useAccounts, useCategories, useToday, useTransactionSummary, useTransactions } from "@/lib/hooks";
import { useOutbox } from "@/lib/offline/outbox";
import { PERIOD_LABEL, periodRange, useDebounced, type PeriodPreset } from "@/lib/ui-hooks";
import { useTheme } from "@/theme/ThemeProvider";

type TypeFilter = "ALL" | "INCOME" | "EXPENSE" | "TRANSFER";
const PRESETS: PeriodPreset[] = ["this_month", "last_month", "last_3_months", "this_year", "all", "custom"];
const METHODS = ["PIX", "DEBIT", "CREDIT", "CASH", "BOLETO", "TED_DOC"] as const;

export default function TransactionsScreen() {
  const { colors } = useTheme();
  const today = useToday();
  const [preset, setPreset] = useState<PeriodPreset>("this_month");
  const [custom, setCustom] = useState<{ from: ISODate; to: ISODate }>({ from: today, to: today });
  const [type, setType] = useState<TypeFilter>("ALL");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [accountId, setAccountId] = useState<string | undefined>();
  const [methods, setMethods] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const debouncedQ = useDebounced(q.trim());

  const range = periodRange(preset, today, custom);
  const filters = useMemo<TransactionFilters>(
    () => ({
      ...range,
      type: type === "ALL" ? undefined : [type],
      categoryId: categoryIds.length ? categoryIds : undefined,
      accountId,
      paymentMethod: methods.length ? methods : undefined,
      q: debouncedQ || undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range.from, range.to, type, categoryIds, accountId, methods, debouncedQ],
  );

  const list = useTransactions(filters);
  const summary = useTransactionSummary({ ...filters, status: "POSTED" });
  const pendingSync = useOutbox((s) => s.items);

  const activeFilters = (type !== "ALL" ? 1 : 0) + (categoryIds.length ? 1 : 0) + (accountId ? 1 : 0) + (methods.length ? 1 : 0);

  const sections = useMemo(() => {
    const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
    const groups: { title: string; date: ISODate; data: Transaction[] }[] = [];
    for (const t of rows) {
      const last = groups[groups.length - 1];
      if (last && last.date === t.occurredOn) last.data.push(t);
      else groups.push({ title: formatDayHeader(t.occurredOn, today), date: t.occurredOn, data: [t] });
    }
    return groups;
  }, [list.data, today]);

  const sum = summary.data;
  const header = (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, gap: 4 }}>
        <Text variant="title" style={{ flex: 1 }}>
          Transações
        </Text>
        <IconButton icon="search" label="Buscar" tone={searchOpen || debouncedQ ? "primary" : "default"} onPress={() => setSearchOpen((s) => !s)} />
        <IconButton icon="list-filter" label="Filtros" tone={activeFilters ? "primary" : "default"} badge={activeFilters || undefined} onPress={() => setFilterOpen(true)} />
      </View>
      {searchOpen ? (
        <View style={{ paddingHorizontal: 16 }}>
          <TextField value={q} onChangeText={setQ} placeholder="Buscar por descrição ou observação" autoFocus left={<Icon name="search" size={18} color={colors.textFaint} />} />
        </View>
      ) : null}
      <View style={{ paddingHorizontal: 16 }}>
        <ChipRow>
          {PRESETS.map((p) => (
            <Chip
              key={p}
              label={p === "custom" && preset === "custom" ? `${custom.from.slice(8)}/${custom.from.slice(5, 7)} – ${custom.to.slice(8)}/${custom.to.slice(5, 7)}` : PERIOD_LABEL[p]}
              selected={preset === p}
              onPress={() => {
                setPreset(p);
                if (p === "custom") setCustomOpen(true);
              }}
            />
          ))}
        </ChipRow>
      </View>
      <View style={{ paddingHorizontal: 16 }}>
        <Card style={{ padding: 14 }}>
          <Row style={{ justifyContent: "space-between" }} align="flex-start">
            <SummaryCell label="Receitas" cents={sum?.incomeCents} tone="positive" />
            <SummaryCell label="Despesas" cents={sum ? -sum.expenseCents : undefined} tone="negative" />
            <SummaryCell label="Saldo do período" cents={sum?.netCents} colorize />
          </Row>
        </Card>
      </View>
      <View style={{ paddingHorizontal: 16 }}>
        <PendingSyncBanner />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Screen scroll={false} padded={false} tabs header={header}>
        {list.isLoading && sections.length === 0 ? (
          <View style={{ padding: 16, gap: 14 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={44} radius={12} />
            ))}
          </View>
        ) : list.isError && sections.length === 0 ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(t) => t.id}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}
            refreshing={list.isRefetching && !list.isFetchingNextPage}
            onRefresh={() => void list.refetch()}
            onEndReachedThreshold={0.4}
            onEndReached={() => {
              if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
            }}
            ListHeaderComponent={
              pendingSync.length > 0 ? (
                <View style={{ gap: 4, marginBottom: 8 }}>
                  {pendingSync.map((p) => (
                    <PendingRow key={p.id} body={p.body} failed={p.error} />
                  ))}
                </View>
              ) : null
            }
            renderSectionHeader={({ section }) => (
              <Text variant="caption" tone="muted" weight="700" style={{ paddingTop: 16, paddingBottom: 4 }}>
                {section.title.toUpperCase()}
              </Text>
            )}
            renderItem={({ item, index, section }) => (
              <View style={{ backgroundColor: colors.surface, paddingHorizontal: 14, borderTopLeftRadius: index === 0 ? 16 : 0, borderTopRightRadius: index === 0 ? 16 : 0, borderBottomLeftRadius: index === section.data.length - 1 ? 16 : 0, borderBottomRightRadius: index === section.data.length - 1 ? 16 : 0, borderBottomWidth: index === section.data.length - 1 ? 0 : 1, borderBottomColor: colors.border }}>
                <TransactionRow tx={item} onPress={() => router.push(`/transaction/${item.id}` as never)} />
              </View>
            )}
            ListEmptyComponent={
              <EmptyState
                icon="receipt"
                title={debouncedQ || activeFilters ? "Nada encontrado" : "Nenhuma transação neste período"}
                message={debouncedQ || activeFilters ? "Tente ajustar a busca ou os filtros." : "Toque no + para registrar uma receita ou despesa."}
              />
            }
            ListFooterComponent={list.isFetchingNextPage ? <Skeleton height={44} radius={12} style={{ marginTop: 12 }} /> : null}
          />
        )}
      </Screen>
      <Fab />

      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        type={type}
        setType={setType}
        categoryIds={categoryIds}
        setCategoryIds={setCategoryIds}
        accountId={accountId}
        setAccountId={setAccountId}
        methods={methods}
        setMethods={setMethods}
        onClear={() => {
          setType("ALL");
          setCategoryIds([]);
          setAccountId(undefined);
          setMethods([]);
        }}
      />
      <Sheet visible={customOpen} onClose={() => setCustomOpen(false)} title="Período personalizado">
        <View style={{ gap: 14 }}>
          <DateField label="De" value={custom.from} today={today} onChange={(d) => setCustom((c) => ({ from: d, to: d > c.to ? d : c.to }))} />
          <DateField label="Até" value={custom.to} today={today} onChange={(d) => setCustom((c) => ({ from: d < c.from ? d : c.from, to: d }))} />
          <Button label="Aplicar" onPress={() => setCustomOpen(false)} />
        </View>
      </Sheet>
    </View>
  );
}

function SummaryCell({ label, cents, tone, colorize }: { label: string; cents?: number; tone?: "positive" | "negative"; colorize?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      {cents === undefined ? <Skeleton width={70} height={18} /> : <Money cents={cents} variant="bodySm" weight="700" tone={tone} colorize={colorize} />}
    </View>
  );
}

/** Lançamento criado offline: aparece na lista, marcado como "aguardando conexão". */
function PendingRow({ body, failed }: { body: Record<string, unknown>; failed?: string }) {
  const { colors, radius } = useTheme();
  const cents = Number(body.amountCents ?? 0);
  const income = body.type === "INCOME";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: failed ? colors.negativeSoft : colors.warningSoft }}>
      <Icon name={failed ? "circle-alert" : "cloud-off"} size={20} color={failed ? colors.negative : colors.warning} />
      <View style={{ flex: 1 }}>
        <Text weight="500" numberOfLines={1}>
          {String(body.description ?? body.notes ?? "Lançamento")}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {failed ?? "Aguardando conexão para sincronizar"}
        </Text>
      </View>
      <Money cents={income ? cents : -cents} colorize signed variant="bodySm" />
    </View>
  );
}

function FilterSheet({
  visible,
  onClose,
  type,
  setType,
  categoryIds,
  setCategoryIds,
  accountId,
  setAccountId,
  methods,
  setMethods,
  onClear,
}: {
  visible: boolean;
  onClose: () => void;
  type: TypeFilter;
  setType: (t: TypeFilter) => void;
  categoryIds: string[];
  setCategoryIds: (ids: string[]) => void;
  accountId?: string;
  setAccountId: (id?: string) => void;
  methods: string[];
  setMethods: (m: string[]) => void;
  onClear: () => void;
}) {
  const categories = useCategories(type === "INCOME" ? "INCOME" : type === "EXPENSE" ? "EXPENSE" : undefined);
  const accounts = useAccounts();
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <Sheet visible={visible} onClose={onClose} title="Filtros">
      <View style={{ gap: 20 }}>
        <View style={{ gap: 8 }}>
          <Text variant="caption" tone="muted" weight="600">
            Tipo
          </Text>
          <Segmented<TypeFilter>
            options={[
              { value: "ALL", label: "Todos" },
              { value: "INCOME", label: "Receitas", tone: "positive" },
              { value: "EXPENSE", label: "Despesas", tone: "negative" },
              { value: "TRANSFER", label: "Transf." },
            ]}
            value={type}
            onChange={setType}
          />
        </View>
        <View style={{ gap: 8 }}>
          <Text variant="caption" tone="muted" weight="600">
            Conta
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Chip label="Todas" selected={!accountId} onPress={() => setAccountId(undefined)} />
            {(accounts.data?.data ?? []).map((a) => (
              <Chip key={a.id} label={a.name} selected={accountId === a.id} onPress={() => setAccountId(accountId === a.id ? undefined : a.id)} />
            ))}
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Text variant="caption" tone="muted" weight="600">
            Categoria
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(categories.data?.data ?? []).map((c) => (
              <Chip key={c.id} label={c.name} icon={c.icon} color={c.color} selected={categoryIds.includes(c.id)} onPress={() => setCategoryIds(toggle(categoryIds, c.id))} />
            ))}
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Text variant="caption" tone="muted" weight="600">
            Forma de pagamento
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {METHODS.map((m) => (
              <Chip key={m} label={PAYMENT_METHOD_LABEL_PT[m]} selected={methods.includes(m)} onPress={() => setMethods(toggle(methods, m))} />
            ))}
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Button label="Ver resultados" onPress={onClose} />
          <Button label="Limpar filtros" variant="ghost" onPress={onClear} />
        </View>
      </View>
    </Sheet>
  );
}

