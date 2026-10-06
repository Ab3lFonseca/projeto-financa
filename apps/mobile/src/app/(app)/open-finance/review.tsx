import { useState } from "react";
import { View } from "react-native";
import { Banner, EmptyState, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Controls";
import { SelectField } from "@/components/ui/Inputs";
import { Card, Divider, IconBadge, ListRow, Screen, ScreenHeader } from "@/components/ui/Layout";
import { Money } from "@/components/ui/Money";
import { OptionSheet, Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { api, type BankTransaction } from "@/lib/api/endpoints";
import { formatDateShort } from "@/lib/format";
import { useApiMutation, useBankTransactions, useCategories } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeProvider";

type Tab = "NEW" | "IGNORED";

/** Revisão: cada transação do banco vira lançamento, é conciliada com um lançamento manual ou ignorada. */
export default function ReviewScreen() {
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>("NEW");
  const q = useBankTransactions(tab);
  const items = q.data?.pages.flatMap((p) => p.data) ?? [];
  const [selected, setSelected] = useState<BankTransaction | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [pickCategory, setPickCategory] = useState(false);
  const categories = useCategories(selected?.direction === "CREDIT" ? "INCOME" : "EXPENSE");
  const category = categories.data?.data.find((c) => c.id === categoryId);

  const close = () => {
    setSelected(null);
    setCategoryId(null);
  };
  const doImport = useApiMutation((t: BankTransaction) => api.openFinance.importTx(t.id, { categoryId }), { success: "Lançamento criado", onSuccess: close });
  const doMatch = useApiMutation((t: BankTransaction) => api.openFinance.matchTx(t.id, t.suggestedMatch!.transactionId), { success: "Conciliado com o lançamento existente", onSuccess: close });
  const doIgnore = useApiMutation((t: BankTransaction) => api.openFinance.ignoreTx(t.id), { success: "Transação ignorada", onSuccess: close });
  const doRestore = useApiMutation((t: BankTransaction) => api.openFinance.restoreTx(t.id), { success: "Transação restaurada", onSuccess: close });

  const signed = (t: BankTransaction) => (t.direction === "CREDIT" ? t.amountCents : -t.amountCents);

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()} header={<ScreenHeader title="Revisar transações" />}>
      <Segmented<Tab> options={[{ value: "NEW", label: "Novas" }, { value: "IGNORED", label: "Ignoradas" }]} value={tab} onChange={setTab} />
      {tab === "NEW" ? (
        <Banner tone="info" icon="info">
          Estas transações vieram do seu banco. Importe para virar lançamento, concilie com algo que você já anotou ou ignore.
        </Banner>
      ) : null}

      {q.isLoading && !q.data ? (
        <SkeletonCard lines={5} />
      ) : q.isError && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon="circle-check" title={tab === "NEW" ? "Nada para revisar" : "Nenhuma transação ignorada"} message={tab === "NEW" ? "Quando chegarem novas transações do banco, elas aparecem aqui." : undefined} />
        </Card>
      ) : (
        <>
          <Card style={{ paddingVertical: 6 }}>
            {items.map((t, i) => (
              <View key={t.id}>
                {i > 0 ? <Divider inset={52} /> : null}
                <ListRow
                  title={t.description}
                  subtitle={`${formatDateShort(t.postedOn)} · ${t.account?.name ?? t.card?.name ?? t.accountName}${t.suggestedMatch ? " · parece já lançada" : ""}`}
                  left={<IconBadge icon={t.suggestedMatch ? "link" : t.direction === "CREDIT" ? "arrow-down-left" : "arrow-up-right"} color={t.suggestedMatch ? colors.warning : t.direction === "CREDIT" ? colors.positive : colors.negative} size={36} />}
                  right={<Money cents={signed(t)} signed colorize variant="bodySm" />}
                  onPress={() => setSelected(t)}
                />
              </View>
            ))}
          </Card>
          {q.hasNextPage ? <Button label="Carregar mais" variant="secondary" loading={q.isFetchingNextPage} onPress={() => void q.fetchNextPage()} /> : null}
        </>
      )}

      <Sheet visible={selected !== null} onClose={close} title={selected?.description}>
        {selected ? (
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text tone="muted">
                {formatDateShort(selected.postedOn)} · {selected.institutionName}
              </Text>
              <Money cents={signed(selected)} signed colorize weight="700" />
            </View>

            {tab === "NEW" ? (
              <>
                {selected.suggestedMatch ? (
                  <Card tone="warning" style={{ gap: 8 }}>
                    <Text weight="600">Você já lançou isso?</Text>
                    <Text variant="bodySm">
                      {selected.suggestedMatch.description} · {formatDateShort(selected.suggestedMatch.occurredOn)}
                    </Text>
                    <Button label="Sim, é o mesmo lançamento" variant="secondary" loading={doMatch.isPending} onPress={() => doMatch.mutate(selected)} />
                  </Card>
                ) : null}
                <SelectField label="Categoria (opcional)" value={category?.name ?? null} placeholder="Sem categoria" onPress={() => setPickCategory(true)} />
                <Button label="Importar como lançamento" icon="check" loading={doImport.isPending} onPress={() => doImport.mutate(selected)} />
                <Button label="Ignorar" variant="ghost" loading={doIgnore.isPending} onPress={() => doIgnore.mutate(selected)} />
              </>
            ) : (
              <Button label="Restaurar para revisão" variant="secondary" loading={doRestore.isPending} onPress={() => doRestore.mutate(selected)} />
            )}
          </View>
        ) : null}
      </Sheet>

      <OptionSheet
        visible={pickCategory}
        title="Categoria"
        options={(categories.data?.data ?? []).map((c) => ({ value: c.id, label: c.name, icon: c.icon, color: c.color }))}
        selected={categoryId}
        onSelect={setCategoryId}
        onClose={() => setPickCategory(false)}
      />
    </Screen>
  );
}
