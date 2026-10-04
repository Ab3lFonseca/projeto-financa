import type { ExpoConfig } from "expo/config";

// URL da API: em desenvolvimento aponta para a máquina local; em produção vem do EAS (eas.json).
//   emulador Android → http://10.0.2.2:3000 · aparelho físico → http://<IP-do-PC>:3000
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

// ATENÇÃO antes de publicar: troque o identificador por um domínio SEU (não pode mudar depois
// que o app for publicado na loja). Ver docs/deploy.md.
const APP_ID = "app.financapessoal.mobile";

const config: ExpoConfig = {
  name: "Finança",
  slug: "financa",
  scheme: "financa",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  backgroundColor: "#F6F7F9",
  ios: {
    bundleIdentifier: APP_ID,
    supportsTablet: false,
    infoPlist: {
      NSFaceIDUsageDescription: "Usamos o Face ID para proteger seus dados financeiros.",
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: APP_ID,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#4F46E5",
    },
    // Nada de permissões desnecessárias: o app não usa câmera, localização nem contatos.
    permissions: ["USE_BIOMETRIC", "USE_FINGERPRINT", "POST_NOTIFICATIONS"],
  },
  web: { bundler: "metro", output: "single", favicon: "./assets/favicon.png" },
  plugins: [
    "expo-router",
    ["expo-splash-screen", { image: "./assets/splash-icon.png", imageWidth: 160, backgroundColor: "#4F46E5" }],
    "expo-secure-store",
    "expo-sharing",
    ["expo-notifications", { color: "#4F46E5" }],
    ["expo-local-authentication", { faceIDPermission: "Usamos o Face ID para proteger seus dados financeiros." }],
  ],
  experiments: { reactCompiler: true },
  extra: {
    apiUrl: API_URL,
    // Dados da empresa exibidos nos Termos e na Política (src/content/legal.ts). Defina no build (eas.json → env).
    company: {
      name: process.env.COMPANY_NAME,
      cnpj: process.env.COMPANY_CNPJ,
      dpoEmail: process.env.COMPANY_DPO_EMAIL,
      supportEmail: process.env.COMPANY_SUPPORT_EMAIL,
      city: process.env.COMPANY_CITY,
    },
    // Preenchido pelo `eas init` (ver docs/deploy.md).
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
};

export default config;
