import { router } from "expo-router";
import { EmptyState } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Layout";

/**
 * Página que não existe (ex.: /admin). Substitui a tela padrão do Expo Router, que mostra o endereço pedido e um link
 * "Sitemap" com a estrutura interna do app. Aqui não revelamos nada: só levamos o usuário de volta ao início
 * (se não estiver logado, a área protegida o manda para o login).
 */
export default function NotFoundScreen() {
  return (
    <Screen>
      <EmptyState icon="search" title="Página não encontrada" message="O endereço que você abriu não existe neste app." action="Ir para o início" onAction={() => router.replace("/")} />
    </Screen>
  );
}
