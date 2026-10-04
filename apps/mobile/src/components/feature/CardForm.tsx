import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Controls";
import { MoneyField, SelectField, TextField } from "@/components/ui/Inputs";
import { Screen, ScreenHeader } from "@/components/ui/Layout";
import { OptionSheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { ColorPicker } from "@/components/ui/Pickers";
import { api, type Card } from "@/lib/api/endpoints";
import { useAccounts, useApiMutation, useBanks } from "@/lib/hooks";
import { Stepper } from "./TransactionForm";

const BRANDS = ["VISA", "MASTERCARD", "ELO", "AMEX", "HIPERCARD", "OTHER"] as const;
const BRAND_LABEL: Record<(typeof BRANDS)[number], string> = { VISA: "Visa", MASTERCARD: "Mastercard", ELO: "Elo", AMEX: "Amex", HIPERCARD: "Hipercard", OTHER: "Outra" };

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/wallet" as never);
}

/** Cadastro/edição de cartão de crédito. Nunca pedimos o número completo, validade ou CVV. */
export function CardForm({ initial }: { initial?: Card }) {
  const banks = useBanks().data?.data ?? [];
  const accounts = useAccounts().data?.data ?? [];
  const [name, setName] = useState(initial?.name ?? "");
  const [brand, setBrand] = useState<(typeof BRANDS)[number]>(initial?.brand ?? "OTHER");
  const [last4, setLast4] = useState(initial?.last4 ?? "");
  const [limit, setLimit] = useState<number | null>(initial?.limitCents ?? null);
  const [closingDay, setClosingDay] = useState(initial?.closingDay ?? 5);
  const [dueDay, setDueDay] = useState(initial?.dueDay ?? 12);
  const [bankId, setBankId] = useState<string | null>(initial?.bank?.id ?? null);
  const [payAccountId, setPayAccountId] = useState<string | null>(initial?.payAccount?.id ?? null);
  const [color, setColor] = useState<string | null>(initial?.color ?? null);
  const [bankOpen, setBankOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useApiMutation(
    () => {
      const body = { name: name.trim(), brand, last4: last4 || null, limitCents: limit ?? 0, closingDay, dueDay, bankId, payAccountId, color };
      return initial ? api.cards.update(initial.id, body) : api.cards.create(body);
    },
    { success: initial ? "Cartão atualizado" : "Cartão criado", onSuccess: goBack },
  );

  const submit = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Dê um nome ao cartão.";
    if (last4 && !/^\d{4}$/.test(last4)) e.last4 = "Informe os 4 últimos dígitos.";
    if (limit === null) e.limit = "Informe o limite.";
    setErrors(e);
    if (Object.keys(e).length === 0) save.mutate(undefined);
  };

  const bank = banks.find((b) => b.id === bankId);
  return (
    <Screen keyboard header={<ScreenHeader title={initial ? "Editar cartão" : "Novo cartão"} />} footer={<Button label={initial ? "Salvar alterações" : "Criar cartão"} size="lg" loading={save.isPending} onPress={submit} />}>
      <TextField label="Nome do cartão" value={name} onChangeText={setName} placeholder="Ex.: Nubank Roxinho" error={errors.name} autoCapitalize="words" />
      <SelectField label="Banco (opcional)" value={bank?.name ?? null} placeholder="Escolher banco" onPress={() => setBankOpen(true)} />
      <View style={{ gap: 8 }}>
        <Text variant="caption" tone="muted" weight="600">
          Bandeira
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {BRANDS.map((b) => (
            <Chip key={b} label={BRAND_LABEL[b]} selected={brand === b} onPress={() => setBrand(b)} />
          ))}
        </View>
      </View>
      <TextField label="4 últimos dígitos (opcional)" value={last4} onChangeText={(t) => setLast4(t.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad" placeholder="0000" error={errors.last4} helper="Nunca pedimos o número completo, validade ou código de segurança." />
      <MoneyField label="Limite do cartão" value={limit} onChange={setLimit} error={errors.limit} />
      <View style={{ flexDirection: "row", gap: 24 }}>
        <View style={{ gap: 8, flex: 1 }}>
          <Text variant="caption" tone="muted" weight="600">
            Dia do fechamento
          </Text>
          <Stepper value={closingDay} min={1} max={31} onChange={setClosingDay} />
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Text variant="caption" tone="muted" weight="600">
          Dia do vencimento
        </Text>
        <Stepper value={dueDay} min={1} max={31} onChange={setDueDay} />
        <Text variant="caption" tone="muted">
          Compras feitas até o dia {closingDay} entram na fatura que vence no dia {dueDay}
          {dueDay > closingDay ? " do mesmo mês" : " do mês seguinte"}.
        </Text>
      </View>
      <View style={{ gap: 8 }}>
        <Text variant="caption" tone="muted" weight="600">
          Conta usada para pagar a fatura (opcional)
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip label="Nenhuma" selected={!payAccountId} onPress={() => setPayAccountId(null)} />
          {accounts.map((a) => (
            <Chip key={a.id} label={a.name} selected={payAccountId === a.id} onPress={() => setPayAccountId(a.id)} />
          ))}
        </View>
      </View>
      <ColorPicker value={color} onChange={setColor} />
      <OptionSheet
        visible={bankOpen}
        title="Banco"
        options={[{ value: "", label: "Nenhum" }, ...banks.map((b) => ({ value: b.id, label: b.name }))]}
        selected={bankId ?? ""}
        onSelect={(v) => setBankId(v || null)}
        onClose={() => setBankOpen(false)}
      />
    </Screen>
  );
}
