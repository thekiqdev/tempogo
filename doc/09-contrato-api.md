# Contrato inicial da API

Contrato de desenho, ainda não implementado. Base `/api/v1`, JSON UTF-8, HTTPS, timestamps ISO 8601 com offset obrigatório e respostas normalizadas em UTC. IDs são UUIDs. Organização e checkpoint efetivo são derivados e conferidos pela sessão. Limitar corpo, paginação e frequência de requisições.

## Rotas do MVP

Admin autenticado, limitado à organização:

- `POST /auth/admin/login`, `POST /auth/logout`, `GET /auth/me`.
- `POST /auth/password/forgot`, `POST /auth/password/reset`: tokens de uso único; forgot responde genericamente.
- `GET /events`, `POST /events`, `GET /events/{id}`, `PATCH /events/{id}`.
- `POST /events/{id}/transitions`: `{ "target_state": "running", "reason": "Início da prova", "gun_start_at": "2026-10-04T11:00:00Z", "expected_version": 2 }`.
- `GET /events/{id}/checkpoints`, `POST /events/{id}/checkpoints`, `PATCH /checkpoints/{id}`.
- `POST /checkpoints/{id}/credentials`: retorna código e senha somente nesta resposta, sem cache.
- `POST /credentials/{id}/revoke`: motivo obrigatório, invalida sessões associadas.
- `GET /events/{id}/passages`: filtros `bib`, `checkpoint_id`, `status`, `from`, `to`; `time_basis=captured|received`, padrão `captured`.
- `GET /passages/{id}`, `POST /passages/{id}/revisions`.
- `POST /events/{id}/manual-recoveries`: entrada retrospectiva ou pacote local recuperado; motivo, fonte, UUID original e ator obrigatórios; sempre inicia em revisão.
- `GET /events/{id}/passages.csv`: mesmos filtros e permissão, com limite de volume e auditoria.
- `GET /events/{id}/audit`, `GET /events/{id}/devices`: leitura administrativa paginada.
- P1: `GET/POST /events/{id}/participants`, `PATCH /participants/{id}`.

Operador de checkpoint:

- `POST /auth/checkpoint/login`: `{ "code": "K8M2P7Q4", "password": "<segredo>", "device_id": "<uuid>" }`; cria cookie e retorna contexto/validade sem segredo.
- `GET /checkpoint/context`: evento, ponto, estado, concessão local, versão de configuração e servidor UTC.
- `GET /time`: hora UTC; usado na estimativa de offset, sem certificar relógio.
- `POST /checkpoint/passages`: uma captura; mesmo endpoint usado para retry e reconexão.
- `GET /checkpoint/passages`: somente dados da própria sessão, paginados.
- `POST /checkpoint/review-requests`: identifica passagem da sessão e motivo; não altera valores.
- `POST /checkpoint/heartbeat`: envia apenas estado operacional e quantidade pendente; servidor marca `last_seen_at`.

## Captura manual

```json
{
  "client_event_id": "56a522fc-fb74-4f83-a7db-cff3bb861942",
  "bib_number": "00152",
  "captured_at_raw": "2026-10-04T08:14:42.125-03:00",
  "clock_offset_ms": 120,
  "clock_rtt_ms": 80,
  "clock_measured_at": "2026-10-04T11:14:00.000Z",
  "device_id": "b462aa33-271e-4bd1-8bd4-10c465c21cf8"
}
```

O servidor deriva `source=manual`, organização, evento, checkpoint e ator. Campos não permitidos são rejeitados. Calcula `captured_at_estimated = captured_at_raw + clock_offset_ms`, preserva ambos e avalia plausibilidade. Offset ausente é aceito como tempo incerto, sujeito a revisão.

Primeiro commit: HTTP 201. Replay idêntico: HTTP 200, mesmo ID e `replayed=true`.

```json
{
  "id": "24f6672c-0b96-47ae-88b1-8f9d3c16e4ad",
  "client_event_id": "56a522fc-fb74-4f83-a7db-cff3bb861942",
  "persisted": true,
  "status": "accepted",
  "captured_at_estimated": "2026-10-04T11:14:42.245Z",
  "received_at": "2026-10-04T11:14:42.500Z",
  "replayed": false,
  "version": 0,
  "review_reasons": []
}
```

Idempotência usa `(organization_id, event_id, client_event_id)` e hash canônico dos campos da intenção original, incluindo checkpoint/dispositivo e dados temporais. Reautenticação pode mudar sessão de transporte, mas não esses campos. Confirmar autorização antes de consultar a chave para não vazar registros de outro escopo. Retry não recalcula horário ou gera UUID novo.

## Revisão

`POST /passages/{id}/revisions` recebe `action=correct|invalidate|accept`, `expected_version`, motivo e campos efetivos aplicáveis. API preserva observação e grava revisão/auditoria na mesma transação. Conflito de versão retorna 409 e exige releitura. Repetir revisão após timeout usa `Idempotency-Key` próprio, hash de payload e unicidade por organização; mesma chave/conteúdo retorna revisão existente.

## Erros e paginação

Envelope: `{ "error": { "code": "SESSION_EXPIRED", "message": "Entre novamente para sincronizar", "request_id": "...", "retryable": false } }`.

- 400: JSON ou formato inválido.
- 401: não autenticado ou sessão expirada; manter fila e reautenticar.
- 403: credencial revogada/escopo proibido; parar retry e pedir conciliação.
- 404: recurso inexistente ou invisível ao principal.
- 409: chave reutilizada com conteúdo divergente, versão ou estado incompatível.
- 422: dados semanticamente inválidos; manter erro por item para revisão.
- 429: limite temporário; respeitar `Retry-After`.
- 5xx ou timeout: retry com a mesma intenção, pois commit pode já ter ocorrido.

Página padrão 50, máximo 200; cursor opaco por `(received_at,id)` para estabilidade. Filtros temporais usam intervalo `[from,to)`. Exportação registra filtros e instante de geração. CORS restrito; cookies exigem defesa CSRF nas mutações. OpenAPI executável será entregue e validado contra handlers no incremento de API.

## Implementação atual

A Sprint 01 implementa o subconjunto administrativo descrito em [contratos da Sprint 01](23-contratos-sprint-01.md). Finalização, passagens e credenciais de campo seguem futuras. O contrato executável OpenAPI será consolidado em B4.


## SA-01 — especificação concluída em 23/09/2026

Consultar [contratos da plataforma](40-super-admin-contratos.md). Define a atualização antes do deploy; não representa recursos já implementados. Preserva os fluxos existentes e acrescenta isolamento de sessão, MFA e gestão de contas nas etapas SA-02 a SA-06.
