import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Controls";
import { TextField } from "@/components/ui/Inputs";
import { IconBadge, Screen, ScreenHeader } from "@/components/ui/Layout";
import { OptionSheet } from "@/components/ui/Sheet";
import { ColorPicker, IconPicker } from "@/components/ui/Pickers";
import { Text } from "@/components/ui/Text";
import { api, type Category } from "@/lib/api/endpoints";
import { useApiMutation, useCategories } from "@/lib/hooks";
import { confirmDialog } from "@/lib/ui-store";
import { COLOR_CHOICES } from "@/theme/tokens";

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/categories" as never);
}

/** Criar/editar categoria (nome, tipo, ícone e cor). Excluir pergunta para onde levar os lançamentos. */
export function CategoryForm({ initial, defaultType = "EXPENSE" }: { initial?: Category; defaultType?: "EXPENSE" | "INCOME" }) {
  const [type, setType] = useState<"EXPENSE" | "INCOME">(initial?.type ?? defaultType);
  const [name, setName] = useState(initial?.name ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "tag");
  const [color, setColor] = useState(initial?.color ?? COLOR_CHOICES[0]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const siblings = useCategories(initial?.type ?? type);

  const save = useApiMutation(
    () => (initial ? api.categories.update(initial.id, { name: name.trim(), icon, color }) : api.categories.create({ type, name: name.trim(), icon, color })),
    { success: initial ? "Categoria atualizada" : "Categoria criada", onSuccess: goBack },
  );
  // Atenção: `initial!.id` dentro dos closures quebra o render na criação (initial indefinido):
  // o React Compiler antecipa a leitura de `initial.id`. Por isso o id é lido aqui, com `?.`.
  const categoryId = initial?.id ?? "";
  const archive = useApiMutation((archived: boolean) => api.categories.update(categoryId, { archived }), { success: "Categoria atualizada", onSuccess: goBack });
  const remove = useApiMutation((reassignTo?: string) => api.categories.remove(categoryId, reassignTo), { success: "Categoria excluída", onSuccess: goBack });

  const submit = () => {
    if (!name.trim()) {
      setNameError("Dê um nome à categoria.");
      return;
    }
    setNameError(null);
    save.mutate(undefined);
  };

  const others = (siblings.data?.data ?? []).filter((c) => c.id !== initial?.id);

  return (
    <Screen
      keyboard
      header={<ScreenHeader title={initial ? "Editar categoria" : "Nova categoria"} />}
      footer={<Button label={initial ? "Salvar alterações" : "Criar categoria"} size="lg" loading={save.isPending} onPress={submit} />}
    >
      <View style={{ alignItems: "center", paddingVertical: 8 }}>
        <IconBadge icon={icon} color={color} size={72} />
      </View>
      {!initial ? (
        <Segmented options={[{ value: "EXPENSE", label: "Despesa", tone: "negative" }, { value: "INCOME", label: "Receita", tone: "positive" }]} value={type} onChange={setType} />
      ) : null}
      <TextField label="Nome" value={name} onChangeText={setName} placeholder="Ex.: Pets" maxLength={60} error={nameError} autoCapitalize="sentences" />
      <ColorPicker value={color} onChange={setColor} />
      <IconPicker value={icon} onChange={setIcon} color={color} />

      {initial ? (
        <View style={{ gap: 8 }}>
          {initial.systemKey ? (
            <Text variant="caption" tone="muted">
              Categoria padrão do app: você pode renomear, mudar ícone e cor, ou arquivar.
            </Text>
          ) : null}
          <Button label={initial.archived ? "Reativar categoria" : "Arquivar categoria"} variant="secondary" loading={archive.isPending} onPress={() => archive.mutate(!initial.archived)} />
          <Button
            label="Excluir categoria"
            variant="danger"
            loading={remove.isPending}
            onPress={async () => {
              const ok = await confirmDialog({
                title: "Excluir categoria?",
                message: "Os lançamentos continuam existindo. Você escolhe a seguir se eles vão para outra categoria ou ficam sem categoria.",
                confirmLabel: "Continuar",
                destructive: true,
              });
              if (ok) setReassignOpen(true);
            }}
          />
        </View>
      ) : null}

      <OptionSheet
        visible={reassignOpen}
        title="Mover lançamentos para…"
        options={others.map((c) => ({ value: c.id, label: c.name, icon: c.icon, color: c.color }))}
        onSelect={(id) => remove.mutate(id)}
        onClose={() => setReassignOpen(false)}
        footer={
          <View style={{ paddingTop: 8 }}>
            <Button
              label="Deixar sem categoria"
              variant="secondary"
              onPress={() => {
                setReassignOpen(false);
                remove.mutate(undefined);
              }}
            />
          </View>
        }
      />
    </Screen>
  );
}
