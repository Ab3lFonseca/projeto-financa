import { Redirect } from "expo-router";
import type { ReactNode } from "react";
import { useIsAdmin } from "@/lib/useIsAdmin";

/**
 * Guarda das telas de administração e de diagnóstico: quem não é administrador volta para o início, sem ver nada e sem
 * que a tela chegue a consultar o servidor (as consultas ficam dentro dos filhos). O servidor também recusa (403).
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const isAdmin = useIsAdmin();
  if (!isAdmin) return <Redirect href="/" />;
  return <>{children}</>;
}
