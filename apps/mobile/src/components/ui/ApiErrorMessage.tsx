import { ApiError } from "@/lib/api/client";
import { Text } from "./Text";

/** Mensagem amigável em português para qualquer erro (API, rede ou desconhecido). */
export function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "NETWORK":
        return "Sem conexão. Verifique sua internet e tente novamente.";
      case "RATE_LIMITED":
        return "Muitas tentativas. Aguarde um instante e tente de novo.";
      case "INVALID_CREDENTIALS":
        return "E-mail ou senha incorretos.";
      case "EMAIL_NOT_VERIFIED":
        return "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.";
      case "VERSION_CONFLICT":
        return "Este item foi alterado em outro aparelho. Atualize a tela e tente de novo.";
      case "ACCOUNT_SUSPENDED":
        return "Sua conta está suspensa. Entre em contato com o suporte.";
      case "VALIDATION_ERROR": {
        const first = Object.values(error.fieldErrors)[0];
        return first ?? "Confira os dados informados.";
      }
      case "INTERNAL":
      case "HTTP_ERROR":
        return "Algo deu errado do nosso lado. Tente novamente em instantes.";
      default:
        return error.message || "Algo deu errado. Tente novamente.";
    }
  }
  return "Algo deu errado. Tente novamente.";
}

export function ApiErrorMessage({ error, align }: { error?: unknown; align?: "left" | "center" }) {
  return (
    <Text tone="muted" align={align} accessibilityLiveRegion="polite">
      {errorText(error)}
    </Text>
  );
}
