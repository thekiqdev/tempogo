import type { Writable } from "node:stream";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import type { ApiError, Liveness, Readiness } from "@tempogo/contracts";
import Fastify, { LogController } from "fastify";
import { ZodError } from "zod";
import { type AuthOptions, authService } from "./auth.js";
import { registerCapture } from "./capture.js";
import { HttpError } from "./db.js";
import { registerEvents } from "./events.js";
import { installOperations } from "./operations.js";
import { registerPlatform } from "./platform.js";
import { rateKey } from "./rate-key.js";

export function buildApp(
  checkDatabase: () => Promise<void>,
  logger: boolean | { stream: Writable } = false,
  options?: AuthOptions,
) {
  const app = Fastify({
    logger: logger
      ? {
          ...(typeof logger === "object" ? logger : {}),
          redact: ["req.headers.authorization", "req.headers.cookie"],
        }
      : false,
    logController: new LogController({ disableRequestLogging: true }),
    requestIdHeader: false,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
    bodyLimit: 1024 * 64,
    requestTimeout: 10_000,
  });
  app.register(cookie);
  app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    keyGenerator: (req) => rateKey(req, options?.pool),
  });
  app.register(async (app) => {
    installOperations(app, options?.metricsToken);
    if (options) {
      const auth = authService(options);
      auth.register(app);
      if (options.platform) registerPlatform(app, options.platform);
      registerEvents(app, options.pool, auth);
      registerCapture(app, options, auth);
    }
    app.get<{ Reply: Liveness }>("/api/v1/health/live", async () => ({ status: "ok" }));
    app.get<{ Reply: Readiness }>("/api/v1/health/ready", async (_request, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        await checkDatabase();
        return { status: "ready" };
      } catch {
        // Não devolver conexão, host, credencial ou erro bruto do driver.
        reply.code(503);
        return { status: "unavailable" };
      }
    });
  });
  app.setNotFoundHandler((request, reply) => {
    const body: ApiError = {
      error: {
        code: "NOT_FOUND",
        message: "Rota não encontrada",
        request_id: request.id,
        retryable: false,
      },
    };
    reply.code(404).send(body);
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError)
      return reply.code(422).send({
        error: {
          code: "VALIDATION_ERROR",
          message: error.issues.map((i) => i.path.join(".") + ": " + i.message).join("; "),
          request_id: request.id,
          retryable: false,
        },
      });
    if (error instanceof HttpError)
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          request_id: request.id,
          retryable: false,
        },
      });
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["23505", "23503", "23514"].includes(String(error.code))
    )
      return reply.code(409).send({
        error: {
          code: "DATA_CONFLICT",
          message: "Dados em conflito. Atualize e confira a configuração.",
          request_id: request.id,
          retryable: false,
        },
      });
    const candidate =
      error instanceof Error && "statusCode" in error ? error.statusCode : undefined;
    const status =
      typeof candidate === "number" && candidate >= 400 && candidate < 500 ? candidate : 500;
    request.log.error({ status }, "Falha na requisição");
    const body: ApiError = {
      error: {
        code: status === 500 ? "INTERNAL_ERROR" : "INVALID_REQUEST",
        message: status === 500 ? "Falha interna" : "Requisição inválida",
        request_id: request.id,
        retryable: status === 500,
      },
    };
    reply.code(status).send(body);
  });
  return app;
}
