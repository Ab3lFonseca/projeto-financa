import type { ISODate } from "@app/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Controls";
import { DateField } from "@/components/ui/DateField";
import { ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { MoneyField, TextField } from "@/components/ui/Inputs";
import { Screen, ScreenHeader } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import { api } from "@/lib/api/endpoints";
import { useAccounts, useApiMutation, useToday } from "@/lib/hooks";
import { confirmDialog } from "@/lib/ui-store";
import { useQuery } from "@tanstack/react-query";

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

export default function TransferDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = useToday();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["transfer", id], queryFn: () => api.transfers.get(id!), enabled: !!id });
  const accounts = useAccounts().data?.data ?? [];
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState<ISODate>(today);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!data) return;
    setFromId(data.from.id);
    setToId(data.to.id);
    setAmount(data.amountCents);
    setDate(data.occurredOn);
    setNotes(data.notes ?? "");
  }, [data]);

  const save = useApiMutation(() => api.transfers.update(id!, { fromAccountId: fromId!, toAccountId: toId!, amountCents: amount!, occurredOn: date, notes: notes.trim() || null }), { success: "Transferência atualizada", onSuccess: goBack });
  const remove = useApiMutation(() => api.transfers.remove(id!), { success: "Transferência excluída", onSuccess: goBack });

  if (!data) {
    return (
      <Screen header={<ScreenHeader title="Transferência" />}>
        {isLoading ? <SkeletonCard lines={4} /> : <ErrorState error={error} onRetry={() => void refetch()} />}
      </Screen>
    );
  }

  return (
    <Screen
      keyboard
      header={<ScreenHeader title="Editar transferência" />}
      footer={
        <View style={{ gap: 8 }}>
          <Button label="Salvar alterações" onPress={() => save.mutate(undefined)} loading={save.isPending} disabled={!amount || fromId === toId} size="lg" />
          <Button
            label="Excluir transferência"
            variant="danger"
            loading={remove.isPending}
            onPress={async () => {
              if (await confirmDialog({ title: "Excluir transferência?", message: "Os saldos das duas contas voltam ao que eram antes.", confirmLabel: "Excluir", destructive: true })) remove.mutate(undefined);
            }}
          />
        </View>
      }
    >
      <MoneyField value={amount} onChange={setAmount} large />
      <View style={{ gap: 8 }}>
        <Text variant="caption" tone="muted" weight="600">
          De (origem)
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {accounts.map((a) => (
            <Chip key={a.id} label={a.name} selected={fromId === a.id} onPress={() => setFromId(a.id)} />
          ))}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Text variant="caption" tone="muted" weight="600">
          Para (destino)
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {accounts.map((a) => (
            <Chip key={a.id} label={a.name} selected={toId === a.id} onPress={() => setToId(a.id)} />
          ))}
        </View>
      </View>
      <DateField label="Data" value={date} onChange={setDate} today={today} />
      <TextField label="Observação (opcional)" value={notes} onChangeText={setNotes} multiline />
    </Screen>
  );
}
