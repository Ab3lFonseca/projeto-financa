import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * A pessoa logada é administradora? Só decide o que MOSTRAR (menu, atalhos): quem manda é o servidor, que confere o papel
 * a cada chamada às rotas de administração e de diagnóstico.
 */
export function useIsAdmin(): boolean {
  return useAuth().me?.role === "ADMIN";
}
