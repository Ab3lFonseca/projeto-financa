import { ACCOUNT_TYPE_LABEL_PT } from "@app/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Controls";
import { MoneyField, SelectField, TextField } from "@/components/ui/Inputs";
import { Screen, ScreenHeader } from "@/components/ui/Layout";
import { OptionSheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { ColorPicker } from "@/components/ui/Pickers";
import { api, type Account } from "@/lib/api/endpoints";
import { useApiMutation, useBanks } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeProvider";

const TYPES = ["CHECKING", "SAVINGS", "WALLET", "DIGITAL", "INVESTMENT"] as const;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/wallet" as never);
}

/** Cadastro/edição de conta: nome, tipo, banco, saldo inicial, cor e se entra no saldo total. */
export function AccountForm({ initial }: { initial?: Account }) {
  const { colors } = useTheme();
  const banks = useBanks().data?.data ?? [];
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<(typeof TYPES)[number]>(initial?.type ?? "CHECKING");
  const [bankId, setBankId] = useState<string | null>(initial?.bank?.id ?? null);
  const [opening, setOpening] = useState<number | null>(initial ? initial.openingBalanceCents : 0);
  const [color, setColor] = useState<string | null>(initial?.color ?? null);
  const [includeInTotal, setIncludeInTotal] = useState(initial?.includeInTotal ?? true);
  const [bankOpen, setBankOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bank = banks.find((b) => b.id === bankId);
  const save = useApiMutation(
    () => {
      const body = { name: name.trim(), type, bankId, openingBalanceCents: opening ?? 0, color, includeInTotal };
      return initial ? api.accounts.update(initial.id, body) : api.accounts.create(body);
    },
    { success: initial ? "Conta atualizada" : "Conta criada", onSuccess: goBack },
  );

  return (
    <Screen
      keyboard
      header={<ScreenHeader title={initial ? "Editar conta" : "Nova conta"} />}
      footer={
        <Button
          label={initial ? "Salvar alterações" : "Criar conta"}
          size="lg"
          loading={save.isPending}
          onPress={() => {
            if (!name.trim()) return setError("Dê um nome para a conta.");
            setError(null);
            save.mutate(undefined);
          }}
        />
      }
    >
      <TextField label="Nome da conta" value={name} onChangeText={setName} placeholder="Ex.: Nubank, Itaú, Carteira" error={error} autoCapitalize="words" />
      <View style={{ gap: 8 }}>
        <Text variant="caption" tone="muted" weight="600">
          Tipo
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {TYPES.map((t) => (
            <Chip key={t} label={ACCOUNT_TYPE_LABEL_PT[t]} selected={type === t} onPress={() => setType(t)} />
          ))}
        </View>
      </View>
      {type !== "WALLET" ? (
        <SelectField label="Banco (opcional)" value={bank ? bank.name : null} placeholder="Escolher banco" onPress={() => setBankOpen(true)} />
      ) : null}
      <MoneyField label={initial ? "Saldo inicial (ajuste só se errou no cadastro)" : "Saldo atual"} value={opening} onChange={setOpening} allowNegative helper="Pode ser negativo (cheque especial)." />
      <ColorPicker value={color} onChange={setColor} />
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: includeInTotal }} onPress={() => setIncludeInTotal((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 46, height: 28, borderRadius: 14, backgroundColor: includeInTotal ? colors.primary : colors.surfaceAlt, padding: 3, justifyContent: "center", alignItems: includeInTotal ? "flex-end" : "flex-start", borderWidth: 1, borderColor: colors.border }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: includeInTotal ? "#fff" : colors.textFaint }} />
        </View>
        <View style={{ flex: 1 }}>
          <Text weight="500">Somar no saldo total</Text>
          <Text variant="caption" tone="muted">
            Desligue para investimentos ou reservas que você não quer misturar.
          </Text>
        </View>
      </Pressable>
      <OptionSheet
        visible={bankOpen}
        title="Banco"
        options={[{ value: "", label: "Nenhum" }, ...banks.map((b) => ({ value: b.id, label: b.name, subtitle: b.compeCode ? `Código ${b.compeCode}` : undefined }))]}
        selected={bankId ?? ""}
        onSelect={(v) => setBankId(v || null)}
        onClose={() => setBankOpen(false)}
      />
    </Screen>
  );
}
