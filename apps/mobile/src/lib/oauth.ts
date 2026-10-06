import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { api } from "./api/endpoints";
import { openExternal } from "./open-url";
import { makePkce } from "./pkce";

const KEY = "oauth-verifier-v1";

/** Marcas dos provedores (nome e cor do botão). O desenho é só uma letra/forma simples: não usamos os logotipos oficiais. */
export const OAUTH_LOOK: Record<string, { mark: string; color: string }> = {
  google: { mark: "G", color: "#4285F4" },
  facebook: { mark: "f", color: "#1877F2" },
  apple: { mark: "", color: "#111827" },
  azure: { mark: "M", color: "#00A4EF" },
  twitter: { mark: "X", color: "#111827" },
  discord: { mark: "D", color: "#5865F2" },
  linkedin_oidc: { mark: "in", color: "#0A66C2" },
  github: { mark: "GH", color: "#24292F" },
};

/**
 * Começa o login por outra conta: gera o par PKCE, guarda o segredo (ele precisa sobreviver à ida ao provedor e à volta) e abre a página do
 * provedor. A volta cai em /auth/callback, que troca o código pela sessão.
 */
export async function beginOAuth(provider: string): Promise<void> {
  const pkce = await makePkce(
    (n) => Crypto.getRandomBytes(n),
    (text) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text, { encoding: Crypto.CryptoEncoding.BASE64 }),
  );
  await AsyncStorage.setItem(KEY, pkce.verifier);
  const { url } = await api.auth.oauthStart(provider, pkce.challenge);
  await openExternal(url);
}

/** Lê e APAGA o segredo guardado (cada login usa o seu e ele não deve sobrar). */
export async function takeOAuthVerifier(): Promise<string | null> {
  const verifier = await AsyncStorage.getItem(KEY);
  await AsyncStorage.removeItem(KEY);
  return verifier;
}
