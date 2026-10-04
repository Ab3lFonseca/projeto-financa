import { useLocalSearchParams } from "expo-router";
import { TransactionForm } from "@/components/feature/TransactionForm";

export default function NewTransactionScreen() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  return <TransactionForm initialType={type === "income" ? "INCOME" : "EXPENSE"} />;
}
