import { createHmac } from "node:crypto";

/** HMAC-SHA256 do IP com segredo do servidor. Guardamos só o hash, nunca o IP em claro. */
export function hashIp(ip: string | undefined, pepper: string): string | null {
  if (!ip) return null;
  return createHmac("sha256", pepper).update(ip).digest("hex");
}
