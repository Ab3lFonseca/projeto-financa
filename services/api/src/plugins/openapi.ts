import swagger from "@fastify/swagger";
import type { FastifyInstance } from "fastify";
import { jsonSchemaTransform } from "fastify-type-provider-zod";

/** Gera a especificação OpenAPI a partir dos schemas Zod. Exposta só fora de produção. */
export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: { title: "API de Finanças Pessoais", version: "0.1.0" },
      servers: [{ url: "/" }],
      components: {
        securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
      },
      security: [{ bearerAuth: [] }],
    },
    transform: jsonSchemaTransform,
  });

  if (app.config.NODE_ENV !== "production") {
    app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());
  }
}
