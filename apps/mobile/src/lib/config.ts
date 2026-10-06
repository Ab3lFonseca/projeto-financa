import Constants from "expo-constants";
import { localApiOnPublicHost } from "./api-url";

/** URL base da API (definida em app.config.ts / EAS). Sem barra no final. */
export const API_URL: string = String(Constants.expoConfig?.extra?.apiUrl ?? "http://localhost:3000").replace(/\/+$/, "");

// Na web, o endereço da API é gravado durante o build do site. Se ele foi publicado sem EXPO_PUBLIC_API_URL, avisa em vez de
// falhar em silêncio com "erro de rede" (o aviso também vai para Mais → Configurações → Diagnóstico).
const apiWarning = localApiOnPublicHost((globalThis as { location?: { hostname?: string } }).location?.hostname, API_URL);
if (apiWarning) console.error(`[config] ${apiWarning}`);

/** Versão dos documentos legais exibidos/aceitos no cadastro (deve acompanhar a API). */
export const LEGAL_VERSION = "2026-10-07";
