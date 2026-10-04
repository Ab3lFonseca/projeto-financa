import type { ISODate } from "@app/shared";
import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button, IconButton } from "@/components/ui/Button";
import { Chip, Segmented } from "@/components/ui/Controls";
import { DateField } from "@/components/ui/DateField";
import { Banner } from "@/components/ui/Feedback";
import { MoneyField, TextField } from "@/components/ui/Inputs";
import { Screen, ScreenHeader } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import { errorText } from "@/components/ui/ApiErrorMessage";
import { ApiError } from "@/lib/api/client";
import { api } from "@/lib/api/endpoints";
import { useAccounts, useToday } from "@/lib/hooks";
import { useOutbox } from "@/lib/offline/outbox";
import { toast } from "@/lib/ui-store";
import { useQueryClient } from "@tanstack/react-query";

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/** Transferência entre contas próprias (não conta como receita nem despesa). */
export default function NewTransferScreen() {
  const today = useToday();
  const qc = useQueryClient();
  const accounts = useAccounts().data?.data ?? [];
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState<ISODate>(today);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = fromId ?? accounts[0]?.id ?? null;
  const to = toId ?? accounts.find((a) => a.id !== from)?.id ?? null;

  const submit = async () => {
    setError(null);
    if (!from || !to) return setError("Escolha a conta de origem e a de destino.");
    if (from === to) return setError("A origem e o destino devem ser diferentes.");
    if (!amount || amount <= 0) return setError("Informe um valor maior que zero.");
    setBusy(true);
    const id = randomUUID();
    const body = { id, fromAccountId: from, toAccountId: to, amountCents: amount, occurredOn: date, notes: notes.trim() || null };
    try {
      await api.transfers.create(body, id);
      await qc.invalidateQueries();
      toast.success("Transferência registrada");
      goBack();
    } catch (err) {
      if (err instanceof ApiError && err.isNetwork) {
        useOutbox.getState().enqueue({ id, kind: "transfer", body });
        toast.info("Sem conexão: a transferência será enviada quando a internet voltar.");
        goBack();
      } else {
        setError(errorText(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      keyboard
      header={<ScreenHeader title="Nova transferência" back={false} right={<IconButton icon="x" label="Fechar" onPress={goBack} />} />}
      footer={<Button label="Transferir" onPress={() => void submit()} loading={busy} size="lg" />}
    >
      <Segmented
        options={[
          { value: "EXPENSE", label: "Despesa", tone: "negative" },
          { value: "INCOME", label: "Receita", tone: "positive" },
          { value: "TRANSFER", label: "Transferência" },
        ]}
        value="TRANSFER"
        onChange={(v) => {
          if (v === "EXPENSE") router.replace("/transaction/new");
          if (v === "INCOME") router.replace({ pathname: "/transaction/new", params: { type: "income" } });
        }}
      />
      {accounts.length < 2 ? <Banner tone="warning" icon="landmark" onPress={() => router.push("/account/new")}>Você precisa de pelo menos duas contas para transferir. Toque para criar.</Banner> : null}
      <MoneyField value={amount} onChange={setAmount} large autoFocus />
      <View style={{ gap: 8 }}>
        <Text variant="caption" tone="muted" weight="600">
          De (origem)
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {accounts.map((a) => (
            <Chip key={a.id} label={a.name} selected={from === a.id} onPress={() => setFromId(a.id)} />
          ))}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Text variant="caption" tone="muted" weight="600">
          Para (destino)
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {accounts.map((a) => (
            <Chip key={a.id} label={a.name} selected={to === a.id} onPress={() => setToId(a.id)} />
          ))}
        </View>
      </View>
      <DateField label="Data" value={date} onChange={setDate} today={today} />
      <TextField label="Observação (opcional)" value={notes} onChangeText={setNotes} multiline placeholder="Ex.: Reserva do mês" />
      {error ? (
        <Text tone="negative" variant="bodySm">
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}
