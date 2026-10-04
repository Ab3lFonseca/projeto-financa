import { router } from "expo-router";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Inputs";
import { Screen, ScreenHeader } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import { api } from "@/lib/api/endpoints";
import { useApiMutation } from "@/lib/hooks";

const checks = [
  { label: "10 caracteres ou mais", ok: (p: string) => p.length >= 10 },
  { label: "letras e números", ok: (p: string) => /[A-Za-z]/.test(p) && /\d/.test(p) },
];

export default function ChangePasswordScreen() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  const change = useApiMutation(() => api.me.changePassword(current, next), {
    success: "Senha alterada",
    onSuccess: () => (router.canGoBack() ? router.back() : router.replace("/settings" as never)),
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (!current) e.current = "Informe sua senha atual.";
    if (!checks.every((c) => c.ok(next))) e.next = "A senha precisa de 10+ caracteres, com letras e números.";
    else if (next === current) e.next = "A nova senha deve ser diferente da atual.";
    if (next !== confirm) e.confirm = "As senhas não conferem.";
    setFields(e);
    if (Object.keys(e).length === 0) change.mutate(undefined);
  };

  return (
    <Screen keyboard header={<ScreenHeader title="Alterar senha" />} footer={<Button label="Alterar senha" size="lg" loading={change.isPending} onPress={submit} />}>
      <TextField label="Senha atual" value={current} onChangeText={setCurrent} error={fields.current} secure autoCapitalize="none" autoComplete="current-password" />
      <TextField label="Nova senha" value={next} onChangeText={setNext} error={fields.next} secure autoCapitalize="none" autoComplete="new-password" />
      <TextField label="Confirmar nova senha" value={confirm} onChangeText={setConfirm} error={fields.confirm} secure autoCapitalize="none" autoComplete="new-password" />
      {checks.map((c) => (
        <Text key={c.label} variant="caption" tone={c.ok(next) ? "positive" : "faint"}>
          {c.ok(next) ? "✓" : "•"} {c.label}
        </Text>
      ))}
    </Screen>
  );
}
