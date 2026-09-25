# Contratos — Sprint 04

Versão implementada em 22/09/2026. Rotas administrativas exigem sessão da organização; mutações exigem Origin e CSRF. Rotas de campo usam a sessão restrita do checkpoint. IDs de eventos de outra organização respondem 404. Migration 005_review_management.sql adiciona tabelas com FORCE RLS e permissões apenas SELECT/INSERT para revisões, solicitações e conciliações.

## Consulta administrativa

- GET /api/v1/events/:id/observations
- GET /api/v1/events/:id/observations.csv

Filtros opcionais: bib (1–8 dígitos, igualdade sobre número vigente), checkpoint_id UUID, from/to ISO 8601 com offset (captura vigente, inclusivos), status accepted/pending/invalidated. Consulta aceita limit 1–100 (padrão 50), offset 0–1.000.000. Retorna items, total, pending, invalidated, limit, offset e updated_at.

Item: id, bib original, effective_bib, raw_captured_at, estimated_captured_at, effective_captured_at, received_at, source, checkpoint_id/name, version, disposition, status, possible_duplicate e needs_review. Versão zero significa sem revisão. Situação pending prevalece sobre a disposição enquanto houver evidência não reconhecida.

CSV ignora paginação, usa filtros, limita a 50.000 itens com erro 422 acima do limite, Content-Type text/csv e Cache-Control no-store. Produz auditoria observations.exported. Colunas e importação estão no [guia operacional](28-painel-revisao-e-conciliacao.md).

## Detalhe e decisão

GET /api/v1/events/:id/observations/:observationId retorna observation (inclui evidence_version), revisions com autor/antes/depois, flags e requests históricas.

POST /api/v1/events/:id/observations/:observationId/revisions:

```json
{
  "request_id": "UUID novo para esta intenção de revisão",
  "expected_version": 0,
  "expected_evidence": 1,
  "bib": "00152",
  "captured_at": "2026-09-22T14:00:00.000Z",
  "disposition": "accepted",
  "reason": "Número e horário conferidos com o operador"
}
```

request_id deve ser UUID válido. Motivo: 3–500 caracteres; disposição accepted ou invalidated. Retorna revision e replayed. Repetição do mesmo UUID e conteúdo retorna a decisão gravada; UUID reutilizado com conteúdo diferente gera 409. Versionamento concorrente ou mudança de evidências gera 409 VERSION_CONFLICT. Evidências são contadas a partir de flags e solicitações append-only.

A revisão armazena os motivos de sinalização e IDs de solicitações analisados. Evidência posterior não é resolvida pela revisão antiga. A observação original, o horário bruto, o UUID da captura e o payload original não mudam. Inserção e auditoria fazem parte da mesma transação.

## Solicitação do operador

POST /api/v1/field/observations/:observationId/review-requests recebe request_id UUID e reason de 3–500 caracteres. Apenas observation.session_id igual à sessão autenticada. Repetição é idempotente; referência a outra sessão responde 404. Evento finalizado/arquivado rejeita nova solicitação.

## Conciliação

GET /api/v1/events/:id/reconciliation retorna items, pending_reviews e unreconciled_devices. Cada aparelho inclui última comunicação, pending/sending/blocked, stale, evidência atual, evidência conciliada e reconciled.

POST na mesma rota recebe credential_id UUID, expected_version do evento e reason (3–500). Exige evento closed, versão atual, comunicação há menos de dois minutos e contagens zero. Snapshot inclui quantidade de observações do acesso e contagens reportadas; registros novos ou contagens diferentes invalidam a confirmação. Audit action device.reconciled.

## Transições e auditoria

POST /api/v1/events/:id/transitions mantém expected_version e reason. Amplia closed → finalized e finalized → closed. Finalizar exige zero revisões pendentes e todos os aparelhos conciliados, ou exception_reason de 10–500 caracteres para aparelhos não conciliados. Exceção fora de finalização é 422.

A finalização grava event.finalization_checked com aparelhos não conciliados/evidências/exceção e event.transition na mesma transação. Reabertura incrementa versão, invalida conciliações antigas e mantém coleta fechada. Emissão de novas credenciais também exige reabrir evento finalizado.

GET /api/v1/events/:id/audit aceita limit 1–100 e offset; retorna items e total, ação, ator (email ou identificação de campo), detalhes e data.

## Serialização e limites

Captura, revisão e solicitação mantêm lock compartilhado do evento. Revisões e ingestão usam o mesmo advisory lock por evento. Conciliação, finalização e exportação usam lock exclusivo do evento: não finalizam entre checagem e commit de uma passagem.

Contagens e páginas do painel são uma consulta operacional viva, com ordenação recebimento/ID; não constituem snapshot paginado fixo. Heartbeat é evidência reportada pelo aparelho, não prova de ausência de fila offline. A confirmação humana e eventual exceção permanecem obrigatórias.
