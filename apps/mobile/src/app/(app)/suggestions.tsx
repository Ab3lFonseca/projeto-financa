import { SUGGESTION_MAX } from "@app/shared";
import { useState } from "react";
import { View } from "react-native";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Controls";
import { ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { TextField } from "@/components/ui/Inputs";
import { Card, Reveal, Screen, ScreenHeader, Section } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import { dateText } from "@/lib/access";
import { api } from "@/lib/api/endpoints";
import { useApiMutation, useMySuggestions } from "@/lib/hooks";
import { remainingText, statusLook, suggestionCheck, suggestionCounter } from "@/lib/suggestions";
import { toast } from "@/lib/ui-store";
import { useTheme } from "@/theme/ThemeProvider";

/** Enviar uma sugestão para a equipe e acompanhar a situação das já enviadas (em análise, aprovada para validação ou não aplicável). */
export default function SuggestionsScreen() {
  const { colors } = useTheme();
  const mine = useMySuggestions();
  const [text, setText] = useState("");
  const check = suggestionCheck(text);
  const remaining = mine.data?.remainingToday ?? 5;

  const send = useApiMutation(() => api.suggestions.send(text.trim()), {
    onSuccess: () => {
      setText("");
      toast.success("Sugestão enviada. Obrigado por ajudar!");
    },
  });

  const header = <ScreenHeader title="Enviar sugestão" subtitle="Ajude a decidir o que vem a seguir" backTo="/more" />;

  return (
    <Screen header={header} keyboard refreshing={mine.isRefetching} onRefresh={() => void mine.refetch()}>
      <Reveal index={0}>
        <Card style={{ gap: 12 }}>
          <Text weight="700">Tem uma ideia para o Finança?</Text>
          <Text variant="bodySm" tone="muted">
            Conte o que você gostaria de ver no app e por que ajudaria. A equipe lê todas: as válidas passam por validação para virar novidade.
          </Text>
          <TextField
            label="Sua sugestão"
            value={text}
            onChangeText={setText}
            placeholder="Ex.: Poder anexar a foto do recibo em cada lançamento."
            multiline
            maxLength={SUGGESTION_MAX + 50}
            autoCapitalize="sentences"
            error={text.length > 0 && !check.ok ? check.hint : null}
          />
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
            <Text variant="caption" tone="faint" style={{ flex: 1 }}>
              {remainingText(remaining)}
            </Text>
            <Text variant="caption" tone={check.length > SUGGESTION_MAX ? "negative" : "faint"}>
              {suggestionCounter(text)}
            </Text>
          </View>
          <Text variant="caption" tone="faint">
            Não escreva senhas, dados de cartão ou outros dados pessoais sensíveis.
          </Text>
          <Button label="Enviar sugestão" icon="lightbulb" size="lg" loading={send.isPending} disabled={!check.ok || remaining <= 0} onPress={() => send.mutate(undefined)} />
        </Card>
      </Reveal>

      <Section title="Suas sugestões">
        {mine.isLoading && !mine.data ? (
          <SkeletonCard lines={3} />
        ) : mine.isError && !mine.data ? (
          <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />
        ) : (mine.data?.data.length ?? 0) === 0 ? (
          <Card>
            <Text tone="muted" align="center">
              Você ainda não enviou nenhuma sugestão.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: 10 }}>
            {mine.data!.data.map((s) => {
              const look = statusLook(s.status);
              return (
                <Card key={s.id} style={{ gap: 8 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <Text variant="caption" tone="faint">
                      Enviada em {dateText(s.createdAt)}
                    </Text>
                    <Badge label={look.label} tone={look.tone} />
                  </View>
                  <Text>{s.body}</Text>
                  {s.adminNote ? (
                    <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                      <Icon name="message-circle" size={16} color={colors.primary} />
                      <Text variant="bodySm" tone="muted" style={{ flex: 1 }}>
                        Recado da equipe: {s.adminNote}
                      </Text>
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </View>
        )}
      </Section>
    </Screen>
  );
}
