export const manualBody = {
  type: "object",
  additionalProperties: false,
  required: ["client_event_id", "bib", "raw_captured_at"],
  properties: {
    client_event_id: { type: "string", format: "uuid" },
    bib: { type: "string", pattern: "^[0-9]{1,8}$" },
    raw_captured_at: { type: "string", format: "date-time" },
  },
} as const;
export const manualReply = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "client_event_id",
    "bib",
    "raw_captured_at",
    "received_at",
    "source",
    "possible_duplicate",
    "replayed",
  ],
  properties: {
    id: { type: "string", format: "uuid" },
    client_event_id: { type: "string", format: "uuid" },
    bib: { type: "string", pattern: "^[0-9]{1,8}$" },
    raw_captured_at: { type: "string", format: "date-time" },
    received_at: { type: "string", format: "date-time" },
    source: { type: "string", enum: ["manual"] },
    possible_duplicate: { type: "boolean" },
    replayed: { type: "boolean" },
  },
} as const;

export const syncBody = {
  type: "object",
  additionalProperties: false,
  required: [...manualBody.required, "capture_session_id"],
  properties: {
    ...manualBody.properties,
    capture_session_id: { type: "string", format: "uuid" },
    grant_id: { type: "string", format: "uuid" },
    clock: {
      type: "object",
      additionalProperties: false,
      required: ["offset_ms", "rtt_ms", "measured_at", "uncertain"],
      properties: {
        offset_ms: { type: "number", minimum: -86400000, maximum: 86400000 },
        rtt_ms: { type: "number", minimum: 0, maximum: 60000 },
        measured_at: { type: "string", format: "date-time" },
        uncertain: { type: "boolean" },
      },
    },
  },
  allOf: [
    {
      oneOf: [
        { required: ["grant_id", "clock"] },
        { not: { anyOf: [{ required: ["grant_id"] }, { required: ["clock"] }] } },
      ],
    },
  ],
} as const;
export const syncReply = {
  ...manualReply,
  required: [...manualReply.required, "needs_review", "estimated_captured_at"],
  properties: {
    ...manualReply.properties,
    needs_review: { type: "boolean" },
    estimated_captured_at: { type: "string", format: "date-time", nullable: true },
  },
} as const;

export const captureOpenApi = {
  openapi: "3.0.3",
  info: { title: "TempoGo — captura manual", version: "0.3.0" },
  paths: {
    "/api/v1/field/sync": {
      post: {
        summary: "Sincronizar intenção congelada, inclusive após renovação da mesma credencial",
        security: [{ checkpointCookie: [], csrfHeader: [] }],
        requestBody: { required: true, content: { "application/json": { schema: syncBody } } },
        responses: {
          "200": {
            description: "Replay idêntico",
            content: { "application/json": { schema: syncReply } },
          },
          "201": {
            description: "Commit; needs_review pode ser true",
            content: { "application/json": { schema: syncReply } },
          },
          "400": { description: "Contrato inválido" },
          "401": { description: "Acesso inválido" },
          "403": { description: "Escopo inválido" },
          "409": { description: "Conflito ou evento finalizado" },
        },
      },
    },
    "/api/v1/field/observations": {
      post: {
        summary: "Registrar uma intenção manual imutável no checkpoint da sessão",
        security: [{ checkpointCookie: [], csrfHeader: [] }],
        requestBody: { required: true, content: { "application/json": { schema: manualBody } } },
        responses: {
          "200": {
            description: "Replay idêntico",
            content: { "application/json": { schema: manualReply } },
          },
          "201": {
            description: "Confirmado após commit",
            content: { "application/json": { schema: manualReply } },
          },
          "400": { description: "Contrato inválido" },
          "401": { description: "Sessão expirada ou revogada" },
          "403": { description: "Origem/CSRF inválido" },
          "409": { description: "UUID conflitante ou evento indisponível" },
          "429": { description: "Limite de requisições" },
          "500": { description: "Erro transitório; reenviar o mesmo UUID" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      checkpointCookie: { type: "apiKey", in: "cookie", name: "cc_checkpoint" },
      csrfHeader: { type: "apiKey", in: "header", name: "x-csrf-token" },
    },
  },
};
