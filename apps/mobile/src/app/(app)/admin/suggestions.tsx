import { SUGGESTION_STATUS_LABEL, type AdminSuggestionDTO, type SuggestionStatusName } from "@app/shared";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { AdminGate } from "@/components/AdminGate";
import { Icon } from "@/components/Icon";
import { Segmented } from "@/components/ui/Controls";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { TextField } from "@/components/ui/Inputs";
import { Card, Screen, ScreenHeader } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import { dateText } from "@/lib/access";
import { api } from "@/lib/api/endpoints";
import { useAdminSuggestions, useApiMutation } from "@/lib/hooks";
import { boardTabs, DECISIONS } from "@/lib/suggestions";
import { toast } from "@/lib/ui-store";
import { useTheme } from "@/theme/ThemeProvider";

/** Quadro de sugestões dos usuários: cada uma tem três botões, verde (válida), vermelho (não válida) e branco (em análise). */
export default function AdminSuggestionsScreen() {
  return (
    <AdminGate>
      <Board />
    </AdminGate>
  );
}

const EMPTY: Record<SuggestionStatusName, string> = {
  PENDING: "Nenhuma sugestão esperando análise.",
  APPROVED: "Nenhuma sugestão válida ainda.",
  REJECTED: "Nenhuma sugestão marcada como não válida.",
};

function Board() {
  const [tab, setTab] = useState<SuggestionStatusName>("PENDING");
  const q = useAdminSuggestions(tab);
  const counts = q.data?.counts ?? { PENDING: 0, APPROVED: 0, REJECTED: 0 };
  const header = <ScreenHeader title="Quadro de sugestões" subtitle="Verde passa para a validação; vermelho não" backTo="/admin" />;

  return (
    <Screen header={header} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Segmented<SuggestionStatusName> options={boardTabs(counts).map((t) => ({ value: t.status, label: t.label }))} value={tab} onChange={setTab} />

      {q.isLoading && !q.data ? (
        <SkeletonCard lines={4} />
      ) : q.isError && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (q.data?.data.length ?? 0) === 0 ? (
        <Card>
          <EmptyState icon="lightbulb" title="Tudo em dia" message={EMPTY[tab]} />
        </Card>
      ) : (
        <View style={{ gap: 12 }}>
          {q.data!.data.map((s) => (
            <SuggestionCard key={s.id} s={s} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function SuggestionCard({ s }: { s: AdminSuggestionDTO }) {
  const { colors } = useTheme();
  const [note, setNote] = useState("");
  const decide = useApiMutation((v: { status: SuggestionStatusName }) => api.admin.decideSuggestion(s.id, v.status, note.trim() || null), {
    onSuccess: (_d, v) => {
      setNote("");
      toast.success(DECISIONS.find((d) => d.status === v.status)!.done);
    },
  });
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Text variant="caption" tone="muted" weight="600" style={{ flex: 1 }}>
          {s.author.name ?? "Sem nome"}
        </Text>
        <Text variant="caption" tone="faint">
          {dateText(s.createdAt)}
        </Text>
      </View>
      <Text>{s.body}</Text>
      {s.status !== "PENDING" ? (
        <Text variant="caption" tone="faint">
          {SUGGESTION_STATUS_LABEL[s.status].admin}
          {s.decidedByName ? ` · por ${s.decidedByName}` : ""}
          {s.adminNote ? ` · recado: ${s.adminNote}` : ""}
        </Text>
      ) : null}
      <TextField value={note} onChangeText={setNote} placeholder="Recado para quem sugeriu (opcional)" maxLength={500} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {DECISIONS.map((d) => {
          const current = s.status === d.status;
          const bg = d.color === "green" ? colors.positive : d.color === "red" ? colors.negative : "#FFFFFF";
          const fg = d.color === "white" ? "#111827" : "#FFFFFF";
          return (
            <Pressable
              key={d.status}
              accessibilityRole="button"
              accessibilityLabel={`${d.label}${current ? " (situação atual)" : ""}`}
              accessibilityState={{ selected: current, disabled: decide.isPending }}
              disabled={decide.isPending}
              onPress={() => decide.mutate({ status: d.status })}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                paddingVertical: 11,
                borderRadius: 12,
                backgroundColor: bg,
                borderWidth: d.color === "white" ? 1.5 : 0,
                borderColor: colors.border,
                // a situação atual fica com contorno forte; as outras ficam um pouco mais apagadas
                opacity: current ? 1 : decide.isPending ? 0.5 : 0.82,
                ...(current ? { borderWidth: 3, borderColor: d.color === "white" ? colors.accent : fg } : null),
              }}
            >
              <Icon name={current ? "check" : d.icon} size={16} color={fg} />
              <Text variant="bodySm" weight="700" style={{ color: fg }}>
                {d.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}
