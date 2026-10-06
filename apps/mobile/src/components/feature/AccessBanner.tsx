import { router } from "expo-router";
import { Banner } from "@/components/ui/Feedback";
import { useMe } from "@/lib/auth/AuthProvider";
import { accessBanner } from "@/lib/access";

/** Aviso do teste grátis / somente leitura / cancelamento perto do fim. Não aparece para quem está em dia nem no beta. */
export function AccessBanner() {
  const { entitlements } = useMe();
  const info = accessBanner(entitlements.access, entitlements.billingEnforced);
  if (!info) return null;
  return (
    <Banner tone={info.tone} icon={info.icon} onPress={() => router.push("/subscription" as never)}>
      {info.text}
    </Banner>
  );
}
