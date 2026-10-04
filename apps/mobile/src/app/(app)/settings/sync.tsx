import { useState } from "react";
import { View } from "react-native";
import { Banner, EmptyState } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Controls";
import { Card, Divider, IconBadge, ListRow, Screen, ScreenHeader } from "@/components/ui/Layout";
import { Money } from "@/components/ui/Money";
import { flushOutbox, useOutbox } from "@/lib/offline/outbox";
import { confirmDialog, toast } from "@/lib/ui-store";
import { useTheme } from "@/theme/ThemeProvider";

/** Lançamentos feitos sem internet: aguardando envio ou recusados pelo servidor. */
export default function SyncScreen() {
  const { colors } = useTheme();
  const { items, remove, retry } = useOutbox();
  const [busy, setBusy] = useState(false);

  const sync = async () => {
    setBusy(true);
    const n = await flushOutbox();
    setBusy(false);
    if (n > 0) toast.success(`${n} lançamento(s) sincronizado(s)`);
    else toast.info("Nada foi enviado. Verifique a conexão e tente de novo.");
  };

  return (
    <Screen header={<ScreenHeader title="Sincronização" />} footer={items.length > 0 ? <Button label="Sincronizar agora" icon="refresh-cw" size="lg" loading={busy} onPress={() => void sync()} /> : undefined}>
      {items.length === 0 ? (
        <Card>
          <EmptyState icon="cloud-check" title="Tudo sincronizado" message="Lançamentos feitos sem internet ficam guardados aqui até serem enviados." />
        </Card>
      ) : (
        <>
          <Banner tone="info" icon="cloud-off">
            Estes lançamentos foram salvos no aparelho e serão enviados automaticamente quando houver internet. Reenviar nunca duplica um lançamento.
          </Banner>
          <Card style={{ paddingVertical: 4 }}>
            {items.map((it, i) => {
              const body = it.body as { description?: string; amountCents?: number; type?: string; occurredOn?: string; date?: string };
              const amount = Number(body.amountCents ?? 0);
              return (
                <View key={it.id}>
                  {i > 0 ? <Divider inset={52} /> : null}
                  <ListRow
                    title={body.description || (it.kind === "transfer" ? "Transferência" : "Lançamento")}
                    subtitle={it.error ?? "Aguardando envio"}
                    left={<IconBadge icon={it.error ? "circle-alert" : "cloud-off"} color={it.error ? colors.negative : colors.warning} size={36} />}
                    right={
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <Money cents={body.type === "INCOME" ? amount : -amount} signed colorize variant="bodySm" />
                        {it.error ? <Badge label="Recusado" tone="negative" /> : null}
                      </View>
                    }
                    onPress={async () => {
                      if (it.error) {
                        if (await confirmDialog({ title: "Descartar este lançamento?", message: `O servidor recusou: ${it.error}`, confirmLabel: "Descartar", cancelLabel: "Manter", destructive: true })) remove(it.id);
                      } else if (await confirmDialog({ title: "Descartar antes de enviar?", message: "Ele ainda não chegou ao servidor e será perdido.", confirmLabel: "Descartar", cancelLabel: "Manter", destructive: true })) {
                        remove(it.id);
                      }
                    }}
                  />
                  {it.error ? <Button label="Tentar de novo" variant="ghost" size="sm" fullWidth={false} onPress={() => retry(it.id)} /> : null}
                </View>
              );
            })}
          </Card>
        </>
      )}
    </Screen>
  );
}
