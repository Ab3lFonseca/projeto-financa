import type { ISODate } from "@app/shared";
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
import { ApiError } from "@/lib/api/client";
import { api } from "@/lib/api/endpoints";
import { useAccounts, useApiMutation, useCards, useCategories, useToday } from "@/lib/hooks";

type Freq = "WEEKLY" | "MONTHLY" | "YEARLY";
const FREQ_LABEL: Record<Freq, string> = { WEEKLY: "Semanal", MONTHLY: "Mensal", YEARLY: "Anual" };

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/recurring" as never);
}

/** Nova recorrência: conta fixa ou receita que se repete (aluguel, salário, assinatura...). */
export function RecurringForm() {
  const today = useToday();
  const [type, setType] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [source, setSource] = useState<string | null>(null); // "acc:<id>" | "card:<id>"
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<Freq>("MONTHLY");
  const [startDate, setStartDate] = useState<ISODate>(today);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<"source" | "category" | null>(null);

  const accounts = useAccounts();
  const cards = useCards();
  const categories = useCategories(type);

  const sources = [
    ...(accounts.data?.data ?? []).map((a) => ({ value: `acc:${a.id}`, label: a.name, subtitle: "Conta", icon: a.icon ?? undefined, color: a.color })),
    ...(type === "EXPENSE" ? (cards.data?.data ?? []).map((c) => ({ value: `card:${c.id}`, label: c.name, subtitle: "Cartão de crédito", icon: "credit-card", color: c.color })) : []),
  ];
  const sourceLabel = sources.find((s) => s.value === source)?.label ?? null;
  const category = categories.data?.data.find((c) => c.id === categoryId);

  const save = useApiMutation(
    () => {
      const isCard = source!.startsWith("card:");
      const id = source!.slice(source!.indexOf(":") + 1);
      return api.recurring.create({
        type,
        description: description.trim(),
        amountCents: amount!,
        accountId: isCard ? null : id,
        cardId: isCard ? id : null,
        categoryId,
        paymentMethod: isCard ? "CREDIT" : undefined,
        frequency,
        intervalCount: 1,
        startDate,
        endDate: null,
      });
    },
    { success: "Recorrência criada", onSuccess: goBack },
  );

  const submit = () => {
    const e: Record<string, string> = {};
    if (!description.trim()) e.description = "Descreva a conta (ex.: Aluguel).";
    if (!amount || amount <= 0) e.amount = "Informe o valor.";
    if (!source) e.source = "Escolha a conta ou o cartão.";
    setErrors(e);
    if (Object.keys(e).length === 0) save.mutate(undefined);
  };

  return (
    <Screen keyboard header={<ScreenHeader title="Nova recorrência" />} footer={<Button label="Criar recorrência" size="lg" loading={save.isPending} onPress={submit} />}>
      {save.error instanceof ApiError && save.error.code === "PLAN_LIMIT_REACHED" ? <UpsellCard text={save.error.message} /> : null}
      <Segmented
        options={[{ value: "EXPENSE", label: "Despesa", tone: "negative" }, { value: "INCOME", label: "Receita", tone: "positive" }]}
        value={type}
        onChange={(t) => {
          setType(t);
          setCategoryId(null);
          if (t === "INCOME" && source?.startsWith("card:")) setSource(null);
        }}
      />
      <TextField label="Descrição" value={description} onChangeText={setDescription} placeholder="Ex.: Aluguel" error={errors.description} autoCapitalize="sentences" maxLength={200} />
      <MoneyField label="Valor" value={amount} onChange={setAmount} error={errors.amount} tone={type === "INCOME" ? "positive" : "negative"} />
      <View style={{ gap: 8 }}>
        <Text variant="caption" tone="muted" weight="600">
          Repete
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(Object.keys(FREQ_LABEL) as Freq[]).map((f) => (
            <Chip key={f} label={FREQ_LABEL[f]} selected={frequency === f} onPress={() => setFrequency(f)} />
          ))}
        </View>
      </View>
      <DateField label="Primeira ocorrência" value={startDate} onChange={setStartDate} today={today} />
      <SelectField label={type === "INCOME" ? "Cai na conta" : "Sai da conta / cartão"} value={sourceLabel} placeholder="Selecionar" error={errors.source} onPress={() => setSheet("source")} />
      <SelectField
        label="Categoria (opcional)"
        value={category?.name ?? null}
        placeholder="Sem categoria"
        left={category ? <IconBadge icon={category.icon} color={category.color} size={28} /> : undefined}
        onPress={() => setSheet("category")}
      />
      <Text variant="caption" tone="muted">
        Os lançamentos são criados automaticamente nas datas certas. Você pode pausar ou excluir a recorrência quando quiser.
      </Text>

      <OptionSheet visible={sheet === "source"} title="Conta ou cartão" options={sources} selected={source} onSelect={setSource} onClose={() => setSheet(null)} empty="Crie uma conta primeiro na aba Carteira." />
      <OptionSheet
        visible={sheet === "category"}
        title="Categoria"
        options={(categories.data?.data ?? []).map((c) => ({ value: c.id, label: c.name, icon: c.icon, color: c.color }))}
        selected={categoryId}
        onSelect={setCategoryId}
        onClose={() => setSheet(null)}
      />
    </Screen>
  );
}
