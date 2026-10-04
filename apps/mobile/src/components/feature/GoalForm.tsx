import { GOAL_KIND_LABEL_PT, type ISODate } from "@app/shared";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Controls";
import { DateField } from "@/components/ui/DateField";
import { MoneyField, SelectField, TextField } from "@/components/ui/Inputs";
import { Screen, ScreenHeader } from "@/components/ui/Layout";
import { ColorPicker } from "@/components/ui/Pickers";
import { Text } from "@/components/ui/Text";
import { UpsellCard } from "@/components/feature/Common";
import { ApiError } from "@/lib/api/client";
import { api, type Goal } from "@/lib/api/endpoints";
import { useApiMutation, useToday } from "@/lib/hooks";
import { GOAL_ICON } from "./Rows";

const KINDS = ["EMERGENCY_FUND", "TRAVEL", "VEHICLE", "HOME", "EDUCATION", "RETIREMENT", "EVENT", "OTHER"] as const;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/goals" as never);
}

/** Criar/editar meta: nome, valor, valor inicial, prazo e tipo. */
export function GoalForm({ initial }: { initial?: Goal }) {
  const today = useToday();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<(typeof KINDS)[number]>(initial?.kind ?? "OTHER");
  const [target, setTarget] = useState<number | null>(initial?.targetCents ?? null);
  const [current, setCurrent] = useState<number | null>(initial?.initialCents ?? 0);
  const [deadline, setDeadline] = useState<ISODate | null>(initial?.deadline ?? null);
  const [color, setColor] = useState<string | null>(initial?.color ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useApiMutation(
    () => {
      const common = { name: name.trim(), kind, targetCents: target!, deadline, color };
      return initial ? api.goals.update(initial.id, common) : api.goals.create({ ...common, initialCents: current ?? 0 });
    },
    { success: initial ? "Meta atualizada" : "Meta criada", onSuccess: goBack },
  );

  const submit = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Dê um nome à meta.";
    if (!target || target <= 0) e.target = "Informe o valor que quer alcançar.";
    if (deadline && deadline <= today) e.deadline = "O prazo deve ser uma data futura.";
    setErrors(e);
    if (Object.keys(e).length === 0) save.mutate(undefined);
  };

  return (
    <Screen keyboard header={<ScreenHeader title={initial ? "Editar meta" : "Nova meta"} />} footer={<Button label={initial ? "Salvar alterações" : "Criar meta"} size="lg" loading={save.isPending} onPress={submit} />}>
      {save.error instanceof ApiError && save.error.code === "PLAN_LIMIT_REACHED" ? <UpsellCard text={save.error.message} /> : null}
      <TextField label="Nome da meta" value={name} onChangeText={setName} placeholder="Ex.: Comprar carro" error={errors.name} autoCapitalize="sentences" />
      <View style={{ gap: 8 }}>
        <Text variant="caption" tone="muted" weight="600">
          Categoria
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {KINDS.map((k) => (
            <Chip key={k} label={GOAL_KIND_LABEL_PT[k]} icon={GOAL_ICON[k]} selected={kind === k} onPress={() => setKind(k)} />
          ))}
        </View>
      </View>
      <MoneyField label="Valor objetivo" value={target} onChange={setTarget} error={errors.target} />
      {!initial ? <MoneyField label="Valor inicial (já guardado)" value={current} onChange={setCurrent} /> : null}
      <View style={{ gap: 8 }}>
        {deadline ? (
          <DateField label="Prazo" value={deadline} onChange={setDeadline} today={today} error={errors.deadline} min={today} />
        ) : (
          <SelectField label="Prazo (opcional)" value={null} placeholder="Sem prazo" onPress={() => setDeadline(addYear(today))} />
        )}
        {deadline ? <Button label="Remover prazo" variant="ghost" size="sm" fullWidth={false} onPress={() => setDeadline(null)} /> : null}
      </View>
      <ColorPicker value={color} onChange={setColor} />
    </Screen>
  );
}

function addYear(iso: ISODate): ISODate {
  return `${Number(iso.slice(0, 4)) + 1}${iso.slice(4)}`;
}
