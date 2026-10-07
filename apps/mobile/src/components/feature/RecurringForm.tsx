import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Chip, Segmented } from "@/components/ui/Controls";
import { DateField } from "@/components/ui/DateField";
import { MoneyField, SelectField, TextField } from "@/components/ui/Inputs";
import { IconBadge, Screen, ScreenHeader } from "@/components/ui/Layout";
import { OptionSheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { UpsellCard } from "@/components/feature/Common";
import { Stepper } from "@/components/feature/TransactionForm";
import { ApiError } from "@/lib/api/client";
import { api } from "@/lib/api/endpoints";
import { formatDateShort } from "@/lib/format";
import { useAccounts, useApiMutation, useCards, useCategories, useToday } from "@/lib/hooks";
import {
  buildRecurringBody,
  cadenceText,
  FREQ_LABEL,
  initialRecurringForm,
  lastOccurrenceOf,
  MAX_EVERY,
  MAX_TIMES,
  validateRecurringForm,
  type EndMode,
  type Freq,
  type RecurringFormState,
} from "@/lib/recurring";

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/recurring" as never);
}

const END_OPTIONS: { value: EndMode; label: string }[] = [
  { value: "never", label: "Nunca" },
  { value: "times", label: "Depois de N vezes" },
  { value: "date", label: "Em uma data" },
];

/**
 * Nova recorrência: despesa, receita ou transferência que se repete (aluguel, salário, reserva mensal...), com a frequência, "a cada N" e o fim
 * (nunca, depois de N vezes ou em uma data).
 */
export function RecurringForm() {
  const today = useToday();
  const [s, setS] = useState<RecurringFormState>(() => initialRecurringForm(today));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<"source" | "to" | "category" | null>(null);
  const set = (patch: Partial<RecurringFormState>) => setS((prev) => ({ ...prev, ...patch }));

  const isTransfer = s.type === "TRANSFER";
  const accounts = useAccounts();
  const cards = useCards();
  const categories = useCategories(s.type === "TRANSFER" ? undefined : s.type);

  const accountOptions = (accounts.data?.data ?? []).map((a) => ({ value: `acc:${a.id}`, label: a.name, subtitle: "Conta", icon: a.icon ?? undefined, color: a.color }));
  const sources = [
    ...accountOptions,
    ...(s.type === "EXPENSE" ? (cards.data?.data ?? []).map((c) => ({ value: `card:${c.id}`, label: c.name, subtitle: "Cartão de crédito", icon: "credit-card", color: c.color })) : []),
  ];
  const destinations = (accounts.data?.data ?? []).filter((a) => `acc:${a.id}` !== s.source).map((a) => ({ value: a.id, label: a.name, subtitle: "Conta", icon: a.icon ?? undefined, color: a.color }));
  const sourceLabel = sources.find((o) => o.value === s.source)?.label ?? null;
  const toLabel = (accounts.data?.data ?? []).find((a) => a.id === s.toAccountId)?.name ?? null;
  const category = categories.data?.data.find((c) => c.id === s.categoryId);
  const last = lastOccurrenceOf(s);

  const save = useApiMutation(() => api.recurring.create(buildRecurringBody(s)), { success: "Recorrência criada", onSuccess: goBack });

  const submit = () => {
    const e = validateRecurringForm(s);
    setErrors(e);
    if (Object.keys(e).length === 0) save.mutate(undefined);
  };

  return (
    <Screen keyboard header={<ScreenHeader title="Nova recorrência" />} footer={<Button label="Criar recorrência" size="lg" loading={save.isPending} onPress={submit} />}>
      {save.error instanceof ApiError && save.error.code === "PLAN_LIMIT_REACHED" ? <UpsellCard text={save.error.message} /> : null}
      <Segmented
        options={[
          { value: "EXPENSE", label: "Despesa", tone: "negative" },
          { value: "INCOME", label: "Receita", tone: "positive" },
          { value: "TRANSFER", label: "Transferência" },
        ]}
        value={s.type}
        onChange={(type) => {
          // origem e categoria de um tipo não servem para o outro: limpa o que não vale mais
          const cardSource = s.source?.startsWith("card:");
          set({ type, categoryId: null, toAccountId: null, source: type !== "EXPENSE" && cardSource ? null : s.source });
        }}
      />
      <TextField label="Descrição" value={s.description} onChangeText={(description) => set({ description })} placeholder={isTransfer ? "Ex.: Reserva mensal" : "Ex.: Aluguel"} error={errors.description} autoCapitalize="sentences" maxLength={200} />
      <MoneyField label="Valor" value={s.amountCents} onChange={(amountCents) => set({ amountCents })} error={errors.amount} tone={s.type === "INCOME" ? "positive" : s.type === "EXPENSE" ? "negative" : "default"} />

      <View style={{ gap: 8 }}>
        <Text variant="caption" tone="muted" weight="600">
          Repete
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(Object.keys(FREQ_LABEL) as Freq[]).map((f) => (
            <Chip key={f} label={FREQ_LABEL[f]} selected={s.frequency === f} onPress={() => set({ frequency: f })} />
          ))}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Stepper value={s.every} min={1} max={MAX_EVERY} onChange={(every) => set({ every })} />
          <Text tone="muted" style={{ flex: 1 }}>
            {cadenceText(s.frequency, s.every)}
          </Text>
        </View>
      </View>

      <DateField label="Primeira ocorrência" value={s.startDate} onChange={(startDate) => set({ startDate })} today={today} />

      <View style={{ gap: 8 }}>
        <Text variant="caption" tone="muted" weight="600">
          Termina
        </Text>
        <Segmented<EndMode> options={END_OPTIONS} value={s.endMode} onChange={(endMode) => set({ endMode, endDate: endMode === "date" ? (s.endDate ?? s.startDate) : s.endDate })} />
        {s.endMode === "times" ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Stepper value={s.times} min={2} max={MAX_TIMES} onChange={(times) => set({ times })} />
            <Text tone="muted" style={{ flex: 1 }}>
              {s.times} vezes{last ? `, a última em ${formatDateShort(last)}` : ""}
            </Text>
          </View>
        ) : null}
        {s.endMode === "date" ? <DateField label="Data do fim" value={s.endDate ?? s.startDate} onChange={(endDate) => set({ endDate })} today={today} min={s.startDate} /> : null}
        {errors.end ? (
          <Text variant="caption" tone="negative">
            {errors.end}
          </Text>
        ) : null}
        {s.endMode === "never" ? (
          <Text variant="caption" tone="muted">
            Repete até você pausar ou excluir.
          </Text>
        ) : null}
      </View>

      <SelectField
        label={isTransfer ? "Sai da conta" : s.type === "INCOME" ? "Cai na conta" : "Sai da conta / cartão"}
        value={sourceLabel}
        placeholder="Selecionar"
        error={errors.source}
        onPress={() => setSheet("source")}
      />
      {isTransfer ? <SelectField label="Vai para a conta" value={toLabel} placeholder="Selecionar" error={errors.to} onPress={() => setSheet("to")} /> : null}
      {!isTransfer ? (
        <SelectField
          label="Categoria (opcional)"
          value={category?.name ?? null}
          placeholder="Sem categoria"
          left={category ? <IconBadge icon={category.icon} color={category.color} size={28} /> : undefined}
          onPress={() => setSheet("category")}
        />
      ) : null}
      <Text variant="caption" tone="muted">
        {isTransfer
          ? "As transferências são criadas automaticamente nas datas certas, entre as duas contas. Você pode pausar ou excluir a recorrência quando quiser."
          : "Os lançamentos são criados automaticamente nas datas certas. Você pode pausar ou excluir a recorrência quando quiser."}
      </Text>

      <OptionSheet visible={sheet === "source"} title={isTransfer ? "Conta de origem" : "Conta ou cartão"} options={sources} selected={s.source} onSelect={(source) => set({ source, toAccountId: source === `acc:${s.toAccountId}` ? null : s.toAccountId })} onClose={() => setSheet(null)} empty="Crie uma conta primeiro na aba Carteira." />
      <OptionSheet visible={sheet === "to"} title="Conta de destino" options={destinations} selected={s.toAccountId} onSelect={(toAccountId) => set({ toAccountId })} onClose={() => setSheet(null)} empty="Crie outra conta para transferir entre elas." />
      <OptionSheet
        visible={sheet === "category"}
        title="Categoria"
        options={(categories.data?.data ?? []).map((c) => ({ value: c.id, label: c.name, icon: c.icon, color: c.color }))}
        selected={s.categoryId}
        onSelect={(categoryId) => set({ categoryId })}
        onClose={() => setSheet(null)}
      />
    </Screen>
  );
}
