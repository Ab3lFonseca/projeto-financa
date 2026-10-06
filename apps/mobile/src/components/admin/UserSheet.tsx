import { useState } from "react";
import { View } from "react-native";
import { ShortcutRow } from "@/components/feature/Common";
import { Button } from "@/components/ui/Button";
import { Chip, SwitchRow } from "@/components/ui/Controls";
import { Banner, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { TextField } from "@/components/ui/Inputs";
import { Card, Divider } from "@/components/ui/Layout";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { ACCESS_STATE_LABEL, dateText, GRANT_DURATIONS } from "@/lib/access";
import { api, type AdminUserDetail } from "@/lib/api/endpoints";
import { useMe } from "@/lib/auth/AuthProvider";
import { userLabel } from "@/lib/admin";
import { formatAgo } from "@/lib/format";
import { useAdminUser, useApiMutation } from "@/lib/hooks";
import { confirmDialog } from "@/lib/ui-store";
import { THEME_META } from "@/theme/presets";

const STATUS_LABEL = { ACTIVE: "Ativa", SUSPENDED: "Suspensa", DELETING: "Em exclusão" } as const;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="caption" tone="muted" weight="600">
        {label}
      </Text>
      <Text selectable>{value}</Text>
    </View>
  );
}

/**
 * Detalhe de um usuário e as ações de administrador: cortesia, prorrogar teste, redefinição de senha, desligar a verificação em duas etapas
 * (para quem perdeu o celular), suspender, promover/rebaixar e excluir a conta. Só dados de cadastro: nada financeiro nem de pagamento.
 * O servidor confere tudo de novo (não vale para si mesmo nem para outros administradores).
 */
export function UserSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const me = useMe();
  const detail = useAdminUser(id);
  const u = detail.data;
  const theme = u?.themePreset ? THEME_META.find((m) => m.id === u.themePreset) : null;
  const [panel, setPanel] = useState<"grant" | "trial" | "delete" | null>(null);

  const revoke = useApiMutation((userId: string) => api.admin.revokeAccess(userId), { success: "Acesso gratuito removido" });
  const setStatus = useApiMutation((v: { id: string; status: "ACTIVE" | "SUSPENDED" }) => api.admin.setStatus(v.id, v.status), { success: "Conta atualizada" });
  const setRole = useApiMutation((v: { id: string; role: "USER" | "ADMIN" }) => api.admin.setRole(v.id, v.role), { success: "Papel atualizado" });
  const sendReset = useApiMutation((userId: string) => api.admin.sendPasswordReset(userId), { success: "E-mail de redefinição enviado" });
  const removeMfa = useApiMutation((userId: string) => api.admin.removeMfa(userId), { success: "Verificação em duas etapas desligada" });

  const ask = async (title: string, message: string, confirmLabel: string, run: () => void, destructive = false) => {
    if (await confirmDialog({ title, message, confirmLabel, destructive })) run();
  };

  const isSelf = !!u && u.id === me.id;
  const alive = !!u && u.status !== "DELETING";

  return (
    <>
      <Sheet visible={id !== null && panel === null} onClose={onClose} title={u ? userLabel(u.displayName, u.email) : "Usuário"}>
        {detail.isLoading ? (
          <SkeletonCard lines={4} />
        ) : detail.isError || !u ? (
          <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
        ) : (
          <View style={{ gap: 14, paddingBottom: 8 }}>
            <Field label="Nome" value={u.displayName ?? "Não informado"} />
            <Field label="E-mail" value={u.email} />
            <Field label="Situação da conta" value={STATUS_LABEL[u.status]} />
            <Field label="Papel" value={u.role === "ADMIN" ? "Administrador" : "Usuário"} />
            <Field
              label="Acesso (com a cobrança ligada)"
              value={`${ACCESS_STATE_LABEL[u.access.state]}${u.access.expiresAt ? ` · até ${dateText(u.access.expiresAt)}` : ""}${u.access.investments ? " · com Rendimentos" : ""}`}
            />
            <Field label="Verificação em duas etapas" value={u.mfaEnabled ? "Ligada" : "Desligada"} />
            <Field label="Cadastro" value={new Date(u.createdAt).toLocaleString("pt-BR")} />
            <Field label="Último acesso" value={u.lastSeenAt ? `${new Date(u.lastSeenAt).toLocaleString("pt-BR")} (${formatAgo(u.lastSeenAt)})` : "Nunca"} />
            <Field label="Tutorial de primeiro uso" value={u.onboardingCompleted ? "Concluído" : "Ainda não concluiu"} />
            <Field label="Tema" value={theme ? `${theme.emoji} ${theme.label}` : "—"} />
            <Field label="ID" value={u.id} />

            {isSelf ? (
              <Banner tone="info" icon="info">
                Esta é a sua conta. Para mudar nome, e-mail, senha ou a verificação em duas etapas, use Configurações → Minha conta.
              </Banner>
            ) : alive ? (
              <View style={{ gap: 8 }}>
                <Text weight="700">Ações</Text>
                <Card style={{ paddingVertical: 4 }}>
                  {u.role === "USER" ? (
                    <>
                      <ShortcutRow icon="gift" title={u.access.state === "complimentary" ? "Alterar acesso gratuito" : "Conceder acesso gratuito"} subtitle="Cortesia por dias ou sem prazo" onPress={() => setPanel("grant")} color="#22C55E" />
                      {u.access.state === "complimentary" ? (
                        <>
                          <Divider inset={52} />
                          <ShortcutRow
                            icon="undo-2"
                            title="Remover acesso gratuito"
                            onPress={() => void ask("Remover o acesso gratuito?", "A pessoa volta à situação normal: se o teste grátis já acabou, o app fica somente leitura para ela.", "Remover", () => revoke.mutate(u.id), true)}
                            color="#F59E0B"
                          />
                        </>
                      ) : null}
                      <Divider inset={52} />
                      <ShortcutRow icon="clock" title="Prorrogar o teste grátis" subtitle="Soma dias ao fim do teste" onPress={() => setPanel("trial")} color="#6366F1" />
                      <Divider inset={52} />
                    </>
                  ) : null}
                  <ShortcutRow
                    icon="mail"
                    title="Enviar redefinição de senha"
                    subtitle="O link vai para o e-mail da pessoa"
                    onPress={() => void ask("Enviar o e-mail de redefinição?", `Vamos mandar um link de redefinição de senha para ${u.email}.`, "Enviar", () => sendReset.mutate(u.id))}
                    color="#0EA5E9"
                  />
                  {u.mfaEnabled && u.role === "USER" ? (
                    <>
                      <Divider inset={52} />
                      <ShortcutRow
                        icon="smartphone"
                        title="Remover verificação em duas etapas"
                        subtitle="Para quem perdeu o celular"
                        onPress={() => void ask("Desligar a verificação desta conta?", "Faça isso só depois de confirmar que a conta é da pessoa. Ela volta a entrar só com a senha.", "Desligar", () => removeMfa.mutate(u.id), true)}
                        color="#F59E0B"
                      />
                    </>
                  ) : null}
                  {u.role === "USER" ? (
                    <>
                      <Divider inset={52} />
                      <ShortcutRow
                        icon="ban"
                        title={u.status === "SUSPENDED" ? "Reativar conta" : "Suspender conta"}
                        subtitle={u.status === "SUSPENDED" ? "A pessoa volta a poder entrar" : "A pessoa deixa de conseguir entrar"}
                        onPress={() =>
                          void ask(
                            u.status === "SUSPENDED" ? "Reativar esta conta?" : "Suspender esta conta?",
                            u.status === "SUSPENDED" ? "A pessoa volta a poder entrar." : "A pessoa não consegue mais entrar até você reativar. Os dados dela ficam guardados.",
                            u.status === "SUSPENDED" ? "Reativar" : "Suspender",
                            () => setStatus.mutate({ id: u.id, status: u.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED" }),
                            u.status !== "SUSPENDED",
                          )
                        }
                        color="#EF4444"
                      />
                    </>
                  ) : null}
                  {u.status === "ACTIVE" ? (
                    <>
                      <Divider inset={52} />
                      <ShortcutRow
                        icon="shield"
                        title={u.role === "ADMIN" ? "Remover como administrador" : "Tornar administrador"}
                        subtitle={u.role === "ADMIN" ? "Volta a ser usuário comum" : "Acesso a esta área de administração"}
                        onPress={() =>
                          void ask(
                            u.role === "ADMIN" ? "Remover o papel de administrador?" : "Tornar administrador?",
                            u.role === "ADMIN" ? "A pessoa perde o acesso à administração." : "A pessoa passa a ver o painel de administração (dados de cadastro, nunca dados financeiros).",
                            u.role === "ADMIN" ? "Remover" : "Tornar admin",
                            () => setRole.mutate({ id: u.id, role: u.role === "ADMIN" ? "USER" : "ADMIN" }),
                            u.role === "ADMIN",
                          )
                        }
                        color="#6366F1"
                      />
                    </>
                  ) : null}
                  {u.role === "USER" ? (
                    <>
                      <Divider inset={52} />
                      <ShortcutRow icon="trash" title="Excluir a conta" subtitle="Apaga tudo de vez, sem volta" onPress={() => setPanel("delete")} color="#EF4444" />
                    </>
                  ) : null}
                </Card>
              </View>
            ) : null}
          </View>
        )}
      </Sheet>
      <GrantSheet user={panel === "grant" ? u : undefined} onClose={() => setPanel(null)} />
      <TrialSheet user={panel === "trial" ? u : undefined} onClose={() => setPanel(null)} />
      <DeleteSheet user={panel === "delete" ? u : undefined} onClose={() => setPanel(null)} onDeleted={onClose} />
    </>
  );
}

/** Escolha da duração (e do Rendimentos) para uma cortesia. Não mexe em quem já tem assinatura paga: o servidor recusa. */
function GrantSheet({ user, onClose }: { user: AdminUserDetail | undefined; onClose: () => void }) {
  const [days, setDays] = useState<number | null>(30);
  const [investments, setInvestments] = useState(false);
  const grant = useApiMutation((v: { id: string; days: number | null; investments: boolean }) => api.admin.grantAccess(v.id, { days: v.days, investments: v.investments }), {
    success: "Acesso gratuito concedido",
    onSuccess: onClose,
  });
  return (
    <Sheet visible={!!user} onClose={onClose} title="Acesso gratuito">
      {user ? (
        <View style={{ gap: 16, paddingBottom: 8 }}>
          <Text tone="muted">
            {userLabel(user.displayName, user.email)} poderá usar o app sem pagar. Vale também com a cobrança ligada e não entra na receita.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {GRANT_DURATIONS.map((d) => (
              <Chip key={d.label} label={d.label} selected={days === d.days} onPress={() => setDays(d.days)} />
            ))}
          </View>
          <SwitchRow title="Incluir Rendimentos" subtitle="CDI, CDB e porquinho (plano a mais)" value={investments} onChange={setInvestments} />
          <View style={{ gap: 8 }}>
            <Button label="Conceder" loading={grant.isPending} onPress={() => grant.mutate({ id: user.id, days, investments })} />
            <Button label="Cancelar" variant="ghost" onPress={onClose} />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

/** Prorrogar o teste grátis: soma dias ao fim atual (ou a partir de hoje, se já tinha acabado). */
function TrialSheet({ user, onClose }: { user: AdminUserDetail | undefined; onClose: () => void }) {
  const [days, setDays] = useState(15);
  const extend = useApiMutation((v: { id: string; days: number }) => api.admin.extendTrial(v.id, v.days), { success: "Teste prorrogado", onSuccess: onClose });
  return (
    <Sheet visible={!!user} onClose={onClose} title="Prorrogar o teste grátis">
      {user ? (
        <View style={{ gap: 16, paddingBottom: 8 }}>
          <Text tone="muted">
            {userLabel(user.displayName, user.email)}: os dias escolhidos são somados ao fim do teste (ou contados a partir de hoje, se o teste já tinha acabado).
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[7, 15, 30, 60, 90].map((d) => (
              <Chip key={d} label={`${d} dias`} selected={days === d} onPress={() => setDays(d)} />
            ))}
          </View>
          <View style={{ gap: 8 }}>
            <Button label="Prorrogar" loading={extend.isPending} onPress={() => extend.mutate({ id: user.id, days })} />
            <Button label="Cancelar" variant="ghost" onPress={onClose} />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

/** Excluir a conta de outra pessoa: definitivo, como o pedido dela pela LGPD. Pede a palavra EXCLUIR. */
function DeleteSheet({ user, onClose, onDeleted }: { user: AdminUserDetail | undefined; onClose: () => void; onDeleted: () => void }) {
  const [text, setText] = useState("");
  const del = useApiMutation((userId: string) => api.admin.deleteUser(userId), {
    success: "Conta excluída",
    onSuccess: () => {
      setText("");
      onClose();
      onDeleted();
    },
  });
  return (
    <Sheet visible={!!user} onClose={onClose} title="Excluir conta definitivamente">
      {user ? (
        <View style={{ gap: 14, paddingBottom: 8 }}>
          <Banner tone="negative" icon="triangle-alert">
            Isto apaga a conta de {userLabel(user.displayName, user.email)} e TODOS os dados dela (lançamentos, contas, metas...), cancela a assinatura e remove o login. Não dá para desfazer.
          </Banner>
          <TextField label='Digite "EXCLUIR" para confirmar' value={text} onChangeText={setText} autoCapitalize="characters" />
          <Button label="Excluir tudo" variant="dangerSolid" loading={del.isPending} disabled={text.trim().toUpperCase() !== "EXCLUIR"} onPress={() => del.mutate(user.id)} />
          <Button label="Cancelar" variant="ghost" onPress={onClose} />
        </View>
      ) : null}
    </Sheet>
  );
}
