# Contratos implementados — Sprint 02

> Registro da entrega da Sprint 02. A evolução offline já implementada está no [guia da Sprint 03](26-offline-e-recuperacao.md) e nos [contratos atualizados](27-contratos-sprint-03.md).


Complemento do [contrato administrativo](23-contratos-sprint-01.md). Base: /api/v1. Todas as mutações exigem Origin exata; exceto login, também exigem X-CSRF-Token da sessão correspondente.

## Administração

- POST /checkpoints/:id/access: corpo {label, expires_at}; expires_at ISO 8601 com offset, futuro até 30 dias. Retorna 201 com id, code, label, device_id, expires_at, revoked_at e password mostrada uma vez.
- GET /checkpoints/:id/access: {items}, sem senha/hash, filtrado pela organização do admin.
- POST /access/:id/revoke: {}. Revoga o acesso; uso posterior de qualquer sessão dessa credencial é negado.
- GET /events/:id/observations: {items}, últimos 100 registros da organização/evento, com nome do checkpoint e indicador de possível duplicata.

## Operador

- POST /field/login: {code, password}; retorna csrf_token e cookie cc_checkpoint restrito a /api/v1/field. Código normalizado para maiúsculas. Limite persistente por código e limite por IP. Não aceita checkpoint_id nem organization_id enviados pelo operador.
- GET /field/me: session_id, event_id, checkpoint_id, device_id, event_name, checkpoint_name, label, state, expires_at e csrf_token.
- POST /field/logout: {}. Revoga a sessão.
- GET /field/observations: últimos 100 da própria sessão.
- POST /field/observations: contrato executável descrito abaixo.

## Contrato crítico de gravação

O OpenAPI 3.0.3 de POST /field/observations está em GET /capture/openapi.json. A fonte é apps/api/src/capture-contract.ts; os mesmos schemas JSON validam request e serializam response no Fastify. As demais rotas desta sprint usam schemas Zod e estão descritas acima; o endpoint OpenAPI não pretende documentar toda a API.

Entrada estrita:

```json
{
  "client_event_id": "a3a72ad0-6930-4dd2-a16b-19419bfbb113",
  "bib": "00152",
  "raw_captured_at": "2026-09-16T15:30:01.123Z"
}
```

Campos extras, origem IA, confiança, número como inteiro, checkpoint ou dispositivo fornecido pelo cliente são rejeitados. O servidor resolve escopo e origem manual pela sessão.

Resposta 201 (nova) ou 200 (replay): id, client_event_id, bib, raw_captured_at, received_at, source=manual, possible_duplicate e replayed. A resposta só é emitida depois do COMMIT. Datas do payload canônico são normalizadas para UTC; bib permanece string.

400: contrato JSON inválido. 401: sessão expirada/revogada/checkpoint inativo. 403: CSRF/Origin inválido. 409: conflito de UUID ou corrida/janela indisponível. 429: limite. 500: falha transitória — preservar e reenviar o mesmo UUID.

## Persistência e isolamento

Migration 003_manual_capture.sql acrescenta checkpoint_credentials, checkpoint_sessions, observations e observation_flags.

Credenciais e sessões são tabelas de identidade com localização global por código/hash, como a identidade administrativa. Não têm RLS; todas as operações administrativas filtram organization_id autenticado e as FKs compostas fixam organização/evento/checkpoint. São acessíveis apenas pela API, nunca diretamente pelo navegador. A leitura autenticada de campo revalida credencial, expiração, organização e checkpoint a cada transação.

Observações e flags têm FORCE RLS por organização. O papel cronocheckpoint_app possui apenas SELECT/INSERT nessas tabelas; não pode editar/apagar observações. O runtime continua sem superusuário/BYPASSRLS.

A chave UNIQUE(organization_id,event_id,client_event_id) protege idempotência. Um advisory lock transacional por organização/evento serializa a comparação do payload e a busca de duplicatas humanas. Flags são inseridas separadamente sem modificar a evidência bruta. Falha na auditoria desfaz também observação e flags. Recebimento usa clock_timestamp(), separado da captura informada pelo aparelho.
