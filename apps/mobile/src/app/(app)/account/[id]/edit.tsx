import { useLocalSearchParams } from "expo-router";
import { AccountForm } from "@/components/feature/AccountForm";
import { ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { Screen, ScreenHeader } from "@/components/ui/Layout";
import { useAccount } from "@/lib/hooks";

export default function EditAccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useAccount(id);
  if (data) return <AccountForm initial={data} />;
  return <Screen header={<ScreenHeader title="Editar conta" />}>{isLoading ? <SkeletonCard /> : <ErrorState error={error} onRetry={() => void refetch()} />}</Screen>;
}
