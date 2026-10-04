import { useLocalSearchParams } from "expo-router";
import { CategoryForm } from "@/components/feature/CategoryForm";
import { ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { Screen, ScreenHeader } from "@/components/ui/Layout";
import { useCategories } from "@/lib/hooks";

export default function EditCategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // A API lista (inclusive arquivadas); não há endpoint de leitura individual.
  const { data, isLoading, error, refetch } = useCategories(undefined, true);
  const category = data?.data.find((c) => c.id === id);
  if (!category) {
    return (
      <Screen header={<ScreenHeader title="Categoria" />}>
        {isLoading ? <SkeletonCard lines={3} /> : <ErrorState error={error ?? new Error("Categoria não encontrada")} onRetry={() => void refetch()} />}
      </Screen>
    );
  }
  return <CategoryForm initial={category} />;
}
