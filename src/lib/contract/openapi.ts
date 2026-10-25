import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { ERROR_CODES, errorEnvelopeSchema } from "./errors";
import { dataEnvelope } from "./common";
import { routes } from "./routes";

export const API_VERSION = "0.3.0";

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  registry.registerComponent("securitySchemes", "supabaseJwt", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: "Supabase Auth access token obtained by the app.",
  });
  registry.registerComponent("securitySchemes", "cronSecret", {
    type: "http",
    scheme: "bearer",
    description: "Shared CRON_SECRET. Internal routes only.",
  });

  for (const [id, r] of Object.entries(routes)) {
    const errorResponses = Object.fromEntries(
      [...new Set(r.errors)].map((code) => [
        String(ERROR_CODES[code].status),
        {
          description: [...new Set(r.errors)]
            .filter((c) => ERROR_CODES[c].status === ERROR_CODES[code].status)
            .join(", "),
          content: { "application/json": { schema: errorEnvelopeSchema } },
        },
      ]),
    );

    const body = "body" in r ? r.body : undefined;
    registry.registerPath({
      operationId: id,
      method: r.method.toLowerCase() as "get" | "post" | "patch" | "put" | "delete",
      path: r.path,
      summary: r.summary,
      tags: [r.tag],
      security: r.auth === "user" ? [{ supabaseJwt: [] }] : r.auth === "cron" ? [{ cronSecret: [] }] : [],
      request: {
        ...("params" in r && r.params ? { params: r.params } : {}),
        ...("query" in r && r.query ? { query: r.query } : {}),
        ...(body
          ? {
              body: {
                required: body.kind === "multipart",
                content: {
                  [body.kind === "json" ? "application/json" : "multipart/form-data"]: {
                    schema: body.schema,
                  },
                },
              },
            }
          : {}),
      },
      responses: {
        [String(r.success.status)]: {
          description: r.success.status === 202 ? "Accepted. Poll the status field." : "Success.",
          content: { "application/json": { schema: dataEnvelope(r.success.schema) } },
        },
        ...errorResponses,
      },
      "x-phase": r.phase,
    });
  }

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Meanwhile API",
      version: API_VERSION,
      description:
        "Backend API for the Meanwhile iOS app. Generated from src/lib/contract. See docs/api-contract.md.",
    },
    servers: [{ url: "http://localhost:3000" }],
  });
}
