const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/i;
const LOCAL_API = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i;

/**
 * Site publicado (ex.: Render) que ainda aponta para a API local: acontece quando `EXPO_PUBLIC_API_URL` não existia
 * na hora do build do site (o endereço é gravado no app durante o build). Devolve o aviso, ou null se está tudo certo.
 */
export function localApiOnPublicHost(pageHostname: string | null | undefined, apiUrl: string): string | null {
  if (!pageHostname || LOCAL_HOST.test(pageHostname) || !LOCAL_API.test(apiUrl)) return null;
  return `Este site (${pageHostname}) está apontando para a API local (${apiUrl}). Defina EXPO_PUBLIC_API_URL com o endereço público da API no build do site e faça um novo deploy.`;
}
