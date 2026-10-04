import { useLocalSearchParams } from "expo-router";
import { CardForm } from "@/components/feature/CardForm";
import { ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { Screen, ScreenHeader } from "@/components/ui/Layout";
import { useCard } from "@/lib/hooks";

export default function EditCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useCard(id);
  if (data) return <CardForm initial={data} />;
  return <Screen header={<ScreenHeader title="Editar cartão" />}>{isLoading ? <SkeletonCard /> : <ErrorState error={error} onRetry={() => void refetch()} />}</Screen>;
}
