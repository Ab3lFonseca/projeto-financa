import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { GoalCard } from "@/components/feature/Rows";
import { UpsellCard } from "@/components/feature/Common";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Controls";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { Card, Reveal, Screen, ScreenHeader } from "@/components/ui/Layout";
import { ApiError } from "@/lib/api/client";
import { useGoals } from "@/lib/hooks";

type Tab = "ACTIVE" | "ACHIEVED" | "ARCHIVED";

export default function GoalsScreen() {
  const [tab, setTab] = useState<Tab>("ACTIVE");
  const { data, isLoading, isError, error, refetch, isRefetching } = useGoals(tab);
  const goals = data?.data ?? [];

  return (
    <Screen
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
      header={<ScreenHeader title="Metas" right={<Button label="Nova" icon="plus" size="sm" fullWidth={false} onPress={() => router.push("/goals/new" as never)} />} />}
    >
      <Segmented<Tab> options={[{ value: "ACTIVE", label: "Ativas" }, { value: "ACHIEVED", label: "Atingidas" }, { value: "ARCHIVED", label: "Arquivadas" }]} value={tab} onChange={setTab} />
      {isLoading && !data ? (
        <SkeletonCard lines={4} />
      ) : isError && !data ? (
        error instanceof ApiError && error.code === "PLAN_LIMIT_REACHED" ? <UpsellCard text={error.message} /> : <ErrorState error={error} onRetry={() => void refetch()} />
      ) : goals.length === 0 ? (
        <Card>
          <EmptyState
            icon="trophy"
            title={tab === "ACTIVE" ? "Defina sua primeira meta" : tab === "ACHIEVED" ? "Nenhuma meta atingida ainda" : "Nada arquivado"}
            message={tab === "ACTIVE" ? "Comprar um carro, viajar, montar uma reserva... Acompanhe o progresso e saiba quanto guardar por mês." : undefined}
            action={tab === "ACTIVE" ? "Criar meta" : undefined}
            onAction={() => router.push("/goals/new" as never)}
          />
        </Card>
      ) : (
        <View style={{ gap: 12 }}>
          {goals.map((g, i) => (
            <Reveal key={g.id} index={i}>
              <GoalCard goal={g} onPress={() => router.push(`/goals/${g.id}` as never)} />
            </Reveal>
          ))}
        </View>
      )}
    </Screen>
  );
}
