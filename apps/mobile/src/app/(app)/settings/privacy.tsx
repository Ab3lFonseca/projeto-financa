import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ShortcutRow } from "@/components/feature/Common";
import { Button } from "@/components/ui/Button";
import { Badge, SwitchRow } from "@/components/ui/Controls";
import { ErrorState } from "@/components/ui/Feedback";
import { TextField } from "@/components/ui/Inputs";
import { Card, Divider, ListRow, Screen, ScreenHeader, Section } from "@/components/ui/Layout";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { errorText } from "@/components/ui/ApiErrorMessage";
import { api } from "@/lib/api/endpoints";
import { useAuth, useMe } from "@/lib/auth/AuthProvider";
import { saveTextFile } from "@/lib/export-file";
import { useApiMutation, useConsents, useOpenFinanceStatus } from "@/lib/hooks";
import { useLogStore } from "@/lib/logger";
import { useQuery } from "@tanstack/react-query";
import { confirmDialog, toast } from "@/lib/ui-store";

const go = (p: string) => router.push(p as never);

const REQUEST_LABEL = { EXPORT: "Exportação de dados", DELETE: "Exclusão de conta" } as const;
const STATUS_LABEL = { PENDING: "Pendente", PROCESSING: "Processando", COMPLETED: "Concluída", FAILED: "Falhou" } as const;

function dateBR(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** LGPD: consentimentos, exportação dos dados e exclusão definitiva da conta. */
export default function PrivacyScreen() {
  const me = useMe();
  const { wipeLocal } = useAuth();
  const consents = useConsents();
  const reportsEnabled = useLogStore((s) => s.reportsEnabled);
  const setReportsEnabled = useLogStore((s) => s.setReportsEnabled);
  const requests = useQuery({ queryKey: ["privacy-requests"], queryFn: api.privacy.requests });
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");

  const active = (type: string) => consents.data?.current.find((c) => c.type === type && !c.revokedAt);
  const marketing = !!active("MARKETING");
  const openFinance = !!active("OPEN_FINANCE");
  const ofStatus = useOpenFinanceStatus();
  // A linha fica enquanto o recurso existir neste ambiente (ou houver autorização ativa): senão, ao desligar, ela sumia e não dava para religar.
  const showOpenFinance = openFinance || ofStatus.data?.enabled === true;

  const setConsent = useApiMutation((v: { type: "MARKETING" | "OPEN_FINANCE"; granted: boolean }) => api.privacy.setConsent(v.type, me.legalVersions.privacy, v.granted), { success: "Preferência salva" });

  const toggleOpenFinance = async (granted: boolean) => {
    if (granted) {
      // Ligar passa pela tela do Open Finance, que mostra o que será compartilhado e pede a autorização de forma clara.
      go("/open-finance");
      return;
    }
    const ok = await confirmDialog({
      title: "Desligar o Open Finance?",
      message: "Os bancos conectados serão desconectados e o app para de receber seus dados. Os lançamentos que você já importou continuam. Você pode religar quando quiser.",
      confirmLabel: "Desligar",
      cancelLabel: "Manter ligado",
      destructive: true,
    });
    if (ok) setConsent.mutate({ type: "OPEN_FINANCE", granted: false });
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const json = await api.privacy.exportData();
      const stamp = new Date().toISOString().slice(0, 10);
      const res = await saveTextFile(`meus-dados-${stamp}.json`, json);
      if (res === "unavailable") toast.error("Compartilhamento indisponível neste aparelho.");
      else toast.success("Arquivo gerado com todos os seus dados.");
      void requests.refetch();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setExporting(false);
    }
  };

  // Conta sem senha (entra só por Google/Facebook): confirma com a palavra EXCLUIR e um login recente.
  const hasPassword = me.security?.hasPassword !== false;
  const deleteAccount = useApiMutation(() => api.me.deleteAccount(hasPassword ? password : undefined), {
    silent: false,
    onSuccess: async () => {
      setDeleting(false);
      await wipeLocal();
    },
  });

  return (
    <Screen header={<ScreenHeader title="Privacidade e dados" />}>
      <Text tone="muted" variant="bodySm">
        Seus dados financeiros são só seus: ficam isolados da conta de outros usuários, não são vendidos e você pode levá-los embora ou apagá-los quando quiser. Nunca pedimos a senha do seu banco.
      </Text>

      <Section title="Consentimentos">
        <Card style={{ paddingVertical: 6 }}>
          <ListRow title="Termos de Uso" subtitle={`Versão ${me.legalVersions.terms} · aceito`} right={<Badge label="Obrigatório" />} chevron onPress={() => go("/legal/terms")} />
          <Divider />
          <ListRow title="Política de Privacidade" subtitle={`Versão ${me.legalVersions.privacy} · aceito`} right={<Badge label="Obrigatório" />} chevron onPress={() => go("/legal/privacy")} />
          <Divider />
          <SwitchRow title="Novidades e dicas por e-mail" subtitle="Opcional. Você pode desligar quando quiser." value={marketing} onChange={(granted) => setConsent.mutate({ type: "MARKETING", granted })} />
          <Divider />
          <SwitchRow
            title="Enviar relatórios de erro"
            subtitle="Manda ao servidor só erros técnicos, sem dados pessoais, para podermos corrigi-los. Só a equipe técnica vê."
            value={reportsEnabled}
            onChange={setReportsEnabled}
          />
          {showOpenFinance ? (
            <>
              <Divider />
              <SwitchRow
                title="Open Finance"
                subtitle={
                  openFinance
                    ? "Compartilhamento dos dados dos seus bancos. Desligar desconecta os bancos e revoga o acesso."
                    : "Desligado. Ligue para conectar seus bancos: você vê o que será compartilhado antes de autorizar."
                }
                value={openFinance}
                onChange={(granted) => void toggleOpenFinance(granted)}
              />
            </>
          ) : null}
        </Card>
        {consents.isError ? <ErrorState error={consents.error} onRetry={() => void consents.refetch()} /> : null}
      </Section>

      <Section title="Meus dados">
        <Card style={{ gap: 12 }}>
          <Text variant="bodySm" tone="muted">
            Baixe uma cópia completa dos seus dados (contas, lançamentos, cartões, orçamentos, metas...) em formato JSON.
          </Text>
          <Button label="Exportar meus dados" icon="download" variant="secondary" loading={exporting} onPress={() => void exportData()} />
        </Card>
        {requests.data && requests.data.data.length > 0 ? (
          <Card style={{ paddingVertical: 6 }}>
            {requests.data.data.slice(0, 5).map((r, i) => (
              <View key={r.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow title={REQUEST_LABEL[r.type]} subtitle={dateBR(r.requestedAt)} right={<Badge label={STATUS_LABEL[r.status]} tone={r.status === "COMPLETED" ? "positive" : r.status === "FAILED" ? "negative" : "warning"} />} />
              </View>
            ))}
          </Card>
        ) : null}
      </Section>

      <Section title="Excluir conta">
        <Card tone="negative" style={{ gap: 12 }}>
          <Text variant="bodySm">Apaga definitivamente sua conta e todos os seus dados financeiros. Essa ação não pode ser desfeita.</Text>
          <Button label="Excluir minha conta" variant="danger" onPress={() => setDeleting(true)} />
        </Card>
      </Section>

      <Card style={{ paddingVertical: 6 }}>
        <ShortcutRow icon="file-text" title="Termos de Uso" onPress={() => go("/legal/terms")} color="#94A3B8" />
        <Divider inset={52} />
        <ShortcutRow icon="file-text" title="Política de Privacidade" onPress={() => go("/legal/privacy")} color="#94A3B8" />
      </Card>

      <Sheet visible={deleting} onClose={() => setDeleting(false)} title="Excluir conta definitivamente">
        <View style={{ gap: 14 }}>
          <Text tone="muted">
            {hasPassword
              ? "Para confirmar, digite sua senha e a palavra EXCLUIR. Seus dados serão apagados e não poderão ser recuperados."
              : "Para confirmar, digite a palavra EXCLUIR. Como você entra com Google/Facebook, o seu login precisa ter sido feito há poucos minutos: se der erro, saia e entre de novo. Seus dados serão apagados e não poderão ser recuperados."}
          </Text>
          {hasPassword ? <TextField label="Senha" value={password} onChangeText={setPassword} secure autoCapitalize="none" autoComplete="current-password" /> : null}
          <TextField label='Digite "EXCLUIR"' value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" />
          <Text variant="caption" tone="faint">
            Isso também cancela a assinatura, se houver, e apaga os dados nos nossos provedores.
          </Text>
          <Button label="Excluir tudo e sair" variant="danger" loading={deleteAccount.isPending} disabled={(hasPassword && !password) || confirmText.trim().toUpperCase() !== "EXCLUIR"} onPress={() => deleteAccount.mutate(undefined)} />
          <Button label="Cancelar" variant="ghost" onPress={() => setDeleting(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}
