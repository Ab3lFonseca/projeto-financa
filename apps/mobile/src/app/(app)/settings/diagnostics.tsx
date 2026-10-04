import { useState } from "react";
import { Platform, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Badge, SwitchRow } from "@/components/ui/Controls";
import { EmptyState } from "@/components/ui/Feedback";
import { Card, Divider, IconBadge, ListRow, Screen, ScreenHeader, Section } from "@/components/ui/Layout";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { API_URL } from "@/lib/config";
import { appInfo, buildDiagnosticText, flushErrorReports } from "@/lib/diagnostics";
import { saveTextFile } from "@/lib/export-file";
import { useLogStore, type LogEntry } from "@/lib/logger";
import { confirmDialog, toast } from "@/lib/ui-store";
import { useTheme } from "@/theme/ThemeProvider";

const ICON = { error: "circle-alert", warn: "triangle-alert", info: "info" } as const;

function clock(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

/** Registro de eventos do app: para você (ou o suporte) investigar erros depois. */
export default function DiagnosticsScreen() {
  const { colors } = useTheme();
  const entries = useLogStore((s) => s.entries);
  const reportsEnabled = useLogStore((s) => s.reportsEnabled);
  const setReportsEnabled = useLogStore((s) => s.setReportsEnabled);
  const clear = useLogStore((s) => s.clear);
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [sending, setSending] = useState(false);

  const tone = { error: colors.negative, warn: colors.warning, info: colors.primary };
  const errors = entries.filter((e) => e.level === "error").length;
  const warns = entries.filter((e) => e.level === "warn").length;
  const pending = entries.filter((e) => !e.sent && e.level !== "info").length;
  const shown = [...entries].reverse().slice(0, 100);
  const info = appInfo();

  return (
    <Screen header={<ScreenHeader title="Diagnóstico" />}>
      <Text tone="muted" variant="bodySm">
        O app guarda aqui os últimos eventos técnicos (erros, falhas de conexão com o servidor). Nada pessoal é registrado: e-mails, valores e números
        longos são removidos antes de gravar.
      </Text>

      <Card style={{ gap: 4 }}>
        <Text variant="caption" tone="muted">
          Versão {info.version} · {info.platform}
          {info.osVersion ? ` ${info.osVersion}` : ""} · {Platform.OS === "web" ? "navegador" : "aparelho"}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          Servidor: {API_URL}
        </Text>
        <Text variant="caption" tone="muted">
          {errors} erro(s) · {warns} aviso(s) · {pending} aguardando envio
        </Text>
      </Card>

      <Card style={{ paddingVertical: 4 }}>
        <SwitchRow
          title="Enviar relatórios de erro"
          subtitle="Manda ao servidor só erros técnicos, sem dados pessoais, para podermos corrigi-los"
          value={reportsEnabled}
          onChange={setReportsEnabled}
        />
      </Card>

      <View style={{ gap: 8 }}>
        <Button
          label="Enviar relatório agora"
          icon="refresh-cw"
          variant="secondary"
          loading={sending}
          disabled={!reportsEnabled || pending === 0}
          onPress={async () => {
            setSending(true);
            const n = await flushErrorReports();
            setSending(false);
            if (n > 0) toast.success(`${n} evento(s) enviado(s)`);
            else toast.info("Nada foi enviado. Verifique a conexão e tente de novo.");
          }}
        />
        <Button
          label="Compartilhar / salvar o registro"
          icon="download"
          variant="secondary"
          disabled={entries.length === 0}
          onPress={async () => {
            const stamp = new Date().toISOString().slice(0, 10);
            const res = await saveTextFile(`diagnostico-financa-${stamp}.txt`, buildDiagnosticText(), "text/plain", { dialogTitle: "Salvar diagnóstico", uti: "public.plain-text" });
            if (res === "unavailable") toast.error("Compartilhamento indisponível neste aparelho.");
          }}
        />
        <Button
          label="Limpar registro"
          variant="ghost"
          disabled={entries.length === 0}
          onPress={async () => {
            if (await confirmDialog({ title: "Limpar o registro?", message: "Os eventos guardados neste aparelho serão apagados.", confirmLabel: "Limpar", destructive: true })) clear();
          }}
        />
      </View>

      <Section title="Eventos recentes">
        {shown.length === 0 ? (
          <Card>
            <EmptyState icon="circle-check" title="Nenhum evento registrado" message="Quando algo der errado, aparece aqui." />
          </Card>
        ) : (
          <Card style={{ paddingVertical: 4 }}>
            {shown.map((e, i) => (
              <View key={e.id}>
                {i > 0 ? <Divider inset={52} /> : null}
                <ListRow
                  title={e.message}
                  subtitle={`${clock(e.at)} · ${e.source}${e.screen ? ` · ${e.screen}` : ""}`}
                  left={<IconBadge icon={ICON[e.level]} color={tone[e.level]} size={36} />}
                  right={
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      {e.count > 1 ? <Badge label={`×${e.count}`} /> : null}
                      {e.level !== "info" && e.sent ? <Badge label="enviado" tone="positive" /> : null}
                    </View>
                  }
                  onPress={() => setSelected(e)}
                />
              </View>
            ))}
          </Card>
        )}
      </Section>

      <Sheet visible={selected !== null} onClose={() => setSelected(null)} title={selected ? `${selected.level.toUpperCase()} · ${selected.source}` : undefined}>
        {selected ? (
          <View style={{ gap: 10 }}>
            <Text weight="600">{selected.message}</Text>
            <Text variant="caption" tone="muted">
              {clock(selected.at)}
              {selected.screen ? ` · ${selected.screen}` : ""}
              {selected.count > 1 ? ` · repetiu ${selected.count}×` : ""}
            </Text>
            {selected.context ? (
              <Text variant="caption" tone="muted">
                {JSON.stringify(selected.context)}
              </Text>
            ) : null}
            {selected.stack ? (
              <Text variant="caption" tone="muted" selectable>
                {selected.stack}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
