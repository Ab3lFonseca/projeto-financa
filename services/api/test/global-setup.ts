import { startDevDb } from "@app/dev-db";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    dbUrl: string;
  }
}

/** Sobe UM Postgres real (efêmero) para toda a suíte; cada teste cria seus próprios usuários. */
export default async function setup(project: TestProject) {
  const dataDir = mkdtempSync(join(tmpdir(), "financa-test-pg-"));
  const db = await startDevDb({ dataDir, ephemeral: true });
  project.provide("dbUrl", db.url);
  return async () => {
    await db.stop();
  };
}
