import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Badge, Segmented } from "@/components/ui/Controls";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { Card, Divider, IconBadge, ListRow, Screen, ScreenHeader } from "@/components/ui/Layout";
import { useCategories } from "@/lib/hooks";

type Tab = "EXPENSE" | "INCOME";

export default function CategoriesScreen() {
  const [tab, setTab] = useState<Tab>("EXPENSE");
  const { data, isLoading, isError, error, refetch, isRefetching } = useCategories(tab, true);
  const list = data?.data ?? [];

  return (
    <Screen
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
      header={<ScreenHeader title="Categorias" right={<Button label="Nova" icon="plus" size="sm" fullWidth={false} onPress={() => router.push(`/categories/new?type=${tab}` as never)} />} />}
    >
      <Segmented<Tab> options={[{ value: "EXPENSE", label: "Despesas", tone: "negative" }, { value: "INCOME", label: "Receitas", tone: "positive" }]} value={tab} onChange={setTab} />
      {isLoading && !data ? (
        <SkeletonCard lines={6} />
      ) : isError && !data ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon="tag" title="Nenhuma categoria" action="Criar categoria" onAction={() => router.push(`/categories/new?type=${tab}` as never)} />
        </Card>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {list.map((c, i) => (
            <View key={c.id}>
              {i > 0 ? <Divider inset={52} /> : null}
              <ListRow
                title={c.name}
                subtitle={c.systemKey ? "Padrão do app" : "Criada por você"}
                left={<IconBadge icon={c.icon} color={c.color} size={36} />}
                right={c.archived ? <Badge label="Arquivada" /> : undefined}
                chevron
                onPress={() => router.push(`/categories/${c.id}` as never)}
              />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
