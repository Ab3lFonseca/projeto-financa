import { useLocalSearchParams } from "expo-router";
import { TransactionForm } from "@/components/feature/TransactionForm";
import { ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { Screen, ScreenHeader } from "@/components/ui/Layout";
import { useTransaction } from "@/lib/hooks";

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useTransaction(id);
  if (data) return <TransactionForm key={`${data.id}-${data.version}`} initial={data} />;
  return (
    <Screen header={<ScreenHeader title="Lançamento" />}>
      {isLoading ? <SkeletonCard lines={4} /> : <ErrorState error={error} onRetry={() => void refetch()} />}
    </Screen>
  );
}
