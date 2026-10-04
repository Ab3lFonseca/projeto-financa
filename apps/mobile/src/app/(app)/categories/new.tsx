import { useLocalSearchParams } from "expo-router";
import { CategoryForm } from "@/components/feature/CategoryForm";

export default function NewCategoryScreen() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  return <CategoryForm defaultType={type === "INCOME" ? "INCOME" : "EXPENSE"} />;
}
