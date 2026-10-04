import { bankDTO } from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { runAs } from "../../lib/db";
import { toBankDTO } from "../accounts/service";

/** Catálogo global de bancos (somente leitura). */
export const bankRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/",
    { schema: { tags: ["banks"], response: { 200: z.object({ data: z.array(bankDTO) }) } } },
    async (req) =>
      runAs(req, async (tx) => {
        const banks = await tx.bank.findMany({ orderBy: { name: "asc" } });
        return { data: banks.map((b) => toBankDTO(b)!) };
      }),
  );
};
