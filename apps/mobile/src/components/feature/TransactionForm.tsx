import { PAYMENT_METHOD_LABEL_PT, splitInstallments, type ISODate } from "@app/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/Icon";
import { Button, IconButton } from "@/components/ui/Button";
import { Chip, Segmented } from "@/components/ui/Controls";
import { DateField } from "@/components/ui/DateField";
import { Banner } from "@/components/ui/Feedback";
import { MoneyField, TextField } from "@/components/ui/Inputs";
import { Screen, ScreenHeader } from "@/components/ui/Layout";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { Money } from "@/components/ui/Money";
import { api, type Transaction, type UpdateTransactionInput } from "@/lib/api/endpoints";
import { confirmDialog } from "@/lib/ui-store";
import { useAccounts, useApiMutation, useCards, useCategories, useCreateTransaction, useToday } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeProvider";

const METHODS = ["PIX", "DEBIT", "CASH", "BOLETO", "TED_DOC", "OTHER"] as const;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/**
 * Formulário de receita/despesa. Serve para criar e editar.
 * Sem conexão, a criação entra na fila e é enviada depois (ver useCreateTransaction).
 */
export function TransactionForm({ initial, initialType = "EXPENSE" }: { initial?: Transaction; initialType?: "EXPENSE" | "INCOME" }) {
  const { colors } = useTheme();
  const today = useToday();
  const editing = !!initial;
  const [type, setType] = useState<"EXPENSE" | "INCOME">(initial ? (initial.type === "INCOME" ? "INCOME" : "EXPENSE") : initialType);
  const [amount, setAmount] = useState<number | null>(initial ? initial.amountCents : null);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(initial?.category?.id ?? null);
  const [source, setSource] = useState<"account" | "card">(initial?.card ? "card" : "account");
  const [accountId, setAccountId] = useState<string | null>(initial?.account?.id ?? null);
  const [cardId, setCardId] = useState<string | null>(initial?.card?.id ?? null);
  const [method, setMethod] = useState<(typeof METHODS)[number]>((initial && initial.paymentMethod !== "CREDIT" ? initial.paymentMethod : "PIX") as (typeof METHODS)[number]);
  const [installments, setInstallments] = useState(1);
  const [date, setDate] = useState<ISODate>(initial?.occurredOn ?? today);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [posted, setPosted] = useState(initial ? initial.status === "POSTED" : true);
  const [applyToGroup, setApplyToGroup] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);

  const categories = useCategories(type);
  const accounts = useAccounts();
  const cards = useCards();
  const accountList = accounts.data?.data ?? [];
  const cardList = cards.data?.data ?? [];
  const effectiveAccount = accountId ?? (accountList[0]?.id ?? null);
  const effectiveCard = cardId ?? (cardList[0]?.id ?? null);
  const isInstallment = !!initial?.installment;
  // Parcelar vale ao criar: despesa no cartão, e despesa ou receita na conta (uma parcela por mês).
  const canSplit = !editing && (source === "card" ? type === "EXPENSE" : true);
  const splitting = canSplit && installments > 1;

  const create = useCreateTransaction(() => goBack());
  const update = useApiMutation((v: { id: string; body: UpdateTransactionInput }) => api.transactions.update(v.id, v.body), {
    success: "Lançamento atualizado",
    onSuccess: goBack,
  });
  const remove = useApiMutation((v: { id: string; scope: "one" | "group" }) => api.transactions.remove(v.id, v.scope), {
    success: "Lançamento excluído",
    onSuccess: goBack,
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!amount || amount <= 0) e.amount = "Informe um valor maior que zero.";
    if (!description.trim()) e.description = "Informe uma descrição.";
    if (source === "account" && !effectiveAccount) e.account = "Crie ou escolha uma conta.";
    if (source === "card" && !effectiveCard) e.card = "Escolha um cartão.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    const common = {
      description: description.trim(),
      amountCents: amount!,
      occurredOn: date,
      categoryId,
      notes: notes.trim() ? notes.trim() : null,
    };
    if (!initial) {
      create.mutate({
        type,
        ...common,
        ...(source === "card" ? { cardId: effectiveCard } : { accountId: effectiveAccount, paymentMethod: method }),
        // Parcelado na conta: o servidor decide pela data de cada parcela (a que já passou fica lançada, as futuras ficam agendadas).
        status: source === "account" && !splitting ? (posted ? "POSTED" : "PENDING") : undefined,
        installments: splitting ? Math.min(installments, source === "card" ? 24 : 60) : undefined,
      });
      return;
    }
    // edição: envia só o que mudou
    const body: UpdateTransactionInput = { expectedVersion: initial.version, scope: applyToGroup && isInstallment ? "group" : "one" };
    if (common.description !== initial.description) body.description = common.description;
    if (common.categoryId !== (initial.category?.id ?? null)) body.categoryId = common.categoryId;
    if (common.notes !== (initial.notes ?? null)) body.notes = common.notes;
    if (!(applyToGroup && isInstallment)) {
      if (common.amountCents !== initial.amountCents) body.amountCents = common.amountCents;
      if (common.occurredOn !== initial.occurredOn) body.occurredOn = common.occurredOn;
      if (!isInstallment) {
        if (source === "account" && (effectiveAccount !== initial.account?.id || initial.card)) {
          body.accountId = effectiveAccount;
          body.paymentMethod = method;
        } else if (source === "card" && (effectiveCard !== initial.card?.id || initial.account)) {
          body.cardId = effectiveCard;
        } else if (source === "account" && method !== initial.paymentMethod) {
          body.paymentMethod = method;
        }
      }
      if (source === "account" && (posted ? "POSTED" : "PENDING") !== initial.status) body.status = posted ? "POSTED" : "PENDING";
    }
    update.mutate({ id: initial.id, body });
  };

  const askDelete = async () => {
    if (!initial) return;
    if (isInstallment) {
      setDeleteOpen(true);
      return;
    }
    const ok = await confirmDialog({ title: "Excluir lançamento?", message: "Essa ação não pode ser desfeita.", confirmLabel: "Excluir", destructive: true });
    if (ok) remove.mutate({ id: initial.id, scope: "one" });
  };

  // Transferências são editadas pela tela própria.
  if (initial?.type === "TRANSFER" && initial.transferId) {
    return (
      <Screen header={<ScreenHeader title="Transferência" back />}>
        <Banner tone="info" icon="arrow-left-right">
          Este lançamento faz parte de uma transferência entre contas.
        </Banner>
        <Button label="Abrir transferência" onPress={() => router.replace(`/transfer/${initial.transferId}` as never)} />
      </Screen>
    );
  }

  const tone = type === "INCOME" ? "positive" : "negative";
  const parcel = installments > 1 && amount ? splitInstallments(amount, installments)[0]! : null;
  const busy = create.isPending || update.isPending || remove.isPending;

  return (
    <Screen
      keyboard
      header={
        <ScreenHeader
          title={editing ? "Editar lançamento" : type === "EXPENSE" ? "Nova despesa" : "Nova receita"}
          back={false}
          right={<IconButton icon="x" label="Fechar" onPress={goBack} />}
        />
      }
      footer={
        <View style={{ gap: 8 }}>
          <Button label={editing ? "Salvar alterações" : "Salvar lançamento"} onPress={submit} loading={busy && !remove.isPending} size="lg" />
          {editing ? <Button label="Excluir lançamento" variant="danger" onPress={() => void askDelete()} loading={remove.isPending} /> : null}
        </View>
      }
    >
      {!editing ? (
        <Segmented
          options={[
            { value: "EXPENSE", label: "Despesa", tone: "negative" },
            { value: "INCOME", label: "Receita", tone: "positive" },
            { value: "TRANSFER", label: "Transferência" },
          ]}
          value={type}
          onChange={(v) => {
            if ((v as string) === "TRANSFER") return router.replace("/transfer/new");
            setType(v as "EXPENSE" | "INCOME");
            setCategoryId(null);
            if (v === "INCOME") setSource("account");
          }}
        />
      ) : null}

      <MoneyField value={amount} onChange={setAmount} large autoFocus={!editing} tone={tone} error={errors.amount} />

      <TextField label="Descrição" value={description} onChangeText={setDescription} placeholder={type === "EXPENSE" ? "Ex.: Almoço, Uber, Mercado" : "Ex.: Salário, Freelance"} error={errors.description} autoCapitalize="sentences" />

      <View style={{ gap: 8 }}>
        <Text variant="caption" tone="muted" weight="600">
          Categoria
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(categories.data?.data ?? []).map((c) => (
            <Chip key={c.id} label={c.name} icon={c.icon} color={c.color} selected={categoryId === c.id} onPress={() => setCategoryId(categoryId === c.id ? null : c.id)} />
          ))}
        </View>
      </View>

      {type === "EXPENSE" && !isInstallment && cardList.length > 0 ? (
        <Segmented options={[{ value: "account", label: "Conta" }, { value: "card", label: "Cartão de crédito" }]} value={source} onChange={setSource} />
      ) : null}

      {source === "account" ? (
        <View style={{ gap: 8 }}>
          <Text variant="caption" tone="muted" weight="600">
            {type === "INCOME" ? "Entrou em" : "Saiu de"}
          </Text>
          {accountList.length === 0 ? (
            <Banner tone="warning" icon="landmark" onPress={() => router.push("/account/new")}>
              Você ainda não tem contas. Toque aqui para criar a primeira.
            </Banner>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {accountList.map((a) => (
                <Chip key={a.id} label={a.name} selected={effectiveAccount === a.id} onPress={() => setAccountId(a.id)} />
              ))}
            </View>
          )}
          {errors.account ? <Text variant="caption" tone="negative">{errors.account}</Text> : null}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Text variant="caption" tone="muted" weight="600">
            Cartão
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {cardList.map((c) => (
              <Chip key={c.id} label={c.name} selected={effectiveCard === c.id} onPress={() => setCardId(c.id)} />
            ))}
          </View>
          {errors.card ? <Text variant="caption" tone="negative">{errors.card}</Text> : null}
        </View>
      )}

      {source === "account" && !isInstallment ? (
        <View style={{ gap: 8 }}>
          <Text variant="caption" tone="muted" weight="600">
            Forma de pagamento
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {METHODS.map((m) => (
              <Chip key={m} label={PAYMENT_METHOD_LABEL_PT[m]} selected={method === m} onPress={() => setMethod(m)} />
            ))}
          </View>
        </View>
      ) : null}

      <DateField label="Data" value={date} onChange={setDate} today={today} />

      {canSplit ? (
        <View style={{ gap: 8 }}>
          <Text variant="caption" tone="muted" weight="600">
            {type === "INCOME" ? "Receber em parcelas" : "Parcelas"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Stepper value={installments} min={1} max={source === "card" ? 24 : 60} onChange={setInstallments} />
            <Text tone="muted" style={{ flex: 1 }}>
              {installments === 1 ? "À vista" : parcel ? `${installments}x de ` : ""}
              {installments > 1 && parcel ? <Money cents={parcel} variant="body" weight="700" sensitive={false} /> : null}
            </Text>
          </View>
          {splitting && source === "account" ? (
            <Text variant="caption" tone="muted">
              O valor é dividido em {installments} lançamentos, um por mês a partir da data escolhida. Os dos meses seguintes ficam agendados (pendentes) até chegar o dia.
            </Text>
          ) : null}
        </View>
      ) : null}

      {source === "account" && !splitting ? (
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: posted }}
          onPress={() => setPosted((p) => !p)}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 }}
        >
          <View style={{ width: 46, height: 28, borderRadius: 14, backgroundColor: posted ? colors.primary : colors.surfaceAlt, padding: 3, justifyContent: "center", alignItems: posted ? "flex-end" : "flex-start", borderWidth: 1, borderColor: colors.border }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: posted ? "#fff" : colors.textFaint }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text weight="500">{type === "INCOME" ? "Já recebido" : "Já pago"}</Text>
            <Text variant="caption" tone="muted">
              {posted ? "Entra no saldo e nos gráficos." : "Fica como pendente (conta a pagar/receber) até você confirmar."}
            </Text>
          </View>
        </Pressable>
      ) : null}

      <TextField label="Observação (opcional)" value={notes} onChangeText={setNotes} placeholder="Algum detalhe para lembrar" multiline />

      {isInstallment ? (
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: applyToGroup }} onPress={() => setApplyToGroup((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Icon name={applyToGroup ? "circle-check" : "circle"} size={22} color={applyToGroup ? colors.primary : colors.textFaint} />
          <Text variant="bodySm" style={{ flex: 1 }}>
            Aplicar descrição, categoria e observação a todas as {initial?.installment?.total} parcelas
          </Text>
        </Pressable>
      ) : null}
      {isInstallment ? (
        <Banner tone="info" icon={initial?.card ? "credit-card" : "calendar-clock"}>
          Parcela {initial?.installment?.number} de {initial?.installment?.total}. Valor e data valem só para esta parcela.
        </Banner>
      ) : null}

      <Sheet visible={deleteOpen} onClose={() => setDeleteOpen(false)} title="Excluir compra parcelada">
        <View style={{ gap: 8 }}>
          <Button
            label="Só esta parcela"
            variant="secondary"
            onPress={() => {
              setDeleteOpen(false);
              if (initial) remove.mutate({ id: initial.id, scope: "one" });
            }}
          />
          <Button
            label={`Todas as ${initial?.installment?.total} parcelas`}
            variant="dangerSolid"
            onPress={() => {
              setDeleteOpen(false);
              if (initial) remove.mutate({ id: initial.id, scope: "group" });
            }}
          />
          <Button label="Cancelar" variant="ghost" onPress={() => setDeleteOpen(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}

export function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  const { colors, radius } = useTheme();
  const btn = (label: string, delta: number, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={delta > 0 ? "Aumentar" : "Diminuir"}
      disabled={disabled}
      onPress={() => onChange(Math.max(min, Math.min(max, value + delta)))}
      style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}
    >
      <Text variant="heading">{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      {btn("−", -1, value <= min)}
      <Text variant="heading" style={{ minWidth: 40 }} align="center" tabular>
        {value}x
      </Text>
      {btn("+", 1, value >= max)}
    </View>
  );
}
