import Constants from "expo-constants";

/** URL base da API (definida em app.config.ts / EAS). Sem barra no final. */
export const API_URL: string = String(Constants.expoConfig?.extra?.apiUrl ?? "http://localhost:3000").replace(/\/+$/, "");

/** Versão dos documentos legais exibidos/aceitos no cadastro (deve acompanhar a API). */
export const LEGAL_VERSION = "2026-10-01";
