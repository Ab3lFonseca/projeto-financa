import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Inputs";
import { Screen, ScreenHeader } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import { limitText } from "@/lib/account";
import { ApiError } from "@/lib/api/client";
import { api } from "@/lib/api/endpoints";
import { useAuth, useMe } from "@/lib/auth/AuthProvider";
import { useApiMutation } from "@/lib/hooks";

const checks = [
  { label: "10 caracteres ou mais", ok: (p: string) => p.length >= 10 },
  { label: "letras e números", ok: (p: string) => /[A-Za-z]/.test(p) && /\d/.test(p) },
];

/**
 * Alterar senha (com a senha atual) ou, para quem entra só por Google/Facebook, definir a primeira. A troca tem limite por mês e por ano.
 */
export default function ChangePasswordScreen() {
  const me = useMe();
  const { signOut } = useAuth();
  const hasPassword = me.security?.hasPassword !== false;
  const account = useQuery({ queryKey: ["account"], queryFn: api.me.account });
  const limit = account.data?.limits.PASSWORD;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [needsRelogin, setNeedsRelogin] = useState(false);

  const change = useApiMutation(() => api.me.changePassword(hasPassword ? current : undefined, next), {
    success: hasPassword ? "Senha alterada" : "Senha definida",
    onSuccess: () => (router.canGoBack() ? router.back() : router.replace("/settings/account" as never)),
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (hasPassword && !current) e.current = "Informe sua senha atual.";
    if (!checks.every((c) => c.ok(next))) e.next = "A senha precisa de 10+ caracteres, com letras e números.";
    else if (hasPassword && next === current) e.next = "A nova senha deve ser diferente da atual.";
    if (next !== confirm) e.confirm = "As senhas não conferem.";
    setFields(e);
    if (Object.keys(e).length > 0) return;
    change.mutate(undefined, {
      onError: (err) => {
        if (err instanceof ApiError && err.code === "REAUTH_REQUIRED") setNeedsRelogin(true);
      },
    });
  };

  return (
    <Screen
      keyboard
      header={<ScreenHeader title={hasPassword ? "Alterar senha" : "Definir uma senha"} backTo="/settings/account" />}
      footer={<Button label={hasPassword ? "Alterar senha" : "Definir senha"} size="lg" loading={change.isPending} disabled={limit ? !limit.canChange : false} onPress={submit} />}
    >
      {hasPassword ? null : (
        <Text tone="muted">
          Você entra com Google, Facebook ou outra conta. Definindo uma senha, você também poderá entrar com o seu e-mail. Por segurança, isso pede que o seu login tenha sido feito há poucos minutos.
        </Text>
      )}
      {hasPassword ? <TextField label="Senha atual" value={current} onChangeText={setCurrent} error={fields.current} secure autoCapitalize="none" autoComplete="current-password" /> : null}
      <TextField label="Nova senha" value={next} onChangeText={setNext} error={fields.next} secure autoCapitalize="none" autoComplete="new-password" />
      <TextField label="Confirmar nova senha" value={confirm} onChangeText={setConfirm} error={fields.confirm} secure autoCapitalize="none" autoComplete="new-password" />
      {checks.map((c) => (
        <Text key={c.label} variant="caption" tone={c.ok(next) ? "positive" : "faint"}>
          {c.ok(next) ? "✓" : "•"} {c.label}
        </Text>
      ))}
      {limit ? (
        <Text variant="caption" tone={limit.canChange ? "muted" : "negative"}>
          {limitText(limit)}
        </Text>
      ) : null}
      {needsRelogin ? (
        <Button
          label="Sair e entrar de novo"
          variant="secondary"
          onPress={async () => {
            await signOut();
            router.replace("/login");
          }}
        />
      ) : null}
    </Screen>
  );
}
