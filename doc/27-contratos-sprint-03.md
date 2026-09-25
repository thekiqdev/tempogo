# Contratos implementados — Sprint 03

Complementa os [contratos da Sprint 02](25-contratos-sprint-02.md). A rota legada de observação permanece compatível; a interface atual usa /field/sync.

## Endpoints de campo

- GET /api/v1/field/me: acrescenta credential_id, organization_id e previous_session_ids, apenas da mesma credencial, para localizar a fila local anterior. Não fornece tokens ou histórico de outros aparelhos.
- GET /api/v1/field/time: server_time ISO 8601, sessão válida obrigatória, sem cache.
- POST /api/v1/field/prepare: exige corrida em andamento/janela aberta e autenticação/CSRF; retorna grant {id, issued_at, expires_at, window_id} e server_time. Validade mínima entre sessão e duas horas.
- POST /api/v1/field/sync: uma intenção por requisição, contrato estrito, 201 novo ou 200 replay. O escopo vem da sessão autenticada e da sessão original validada no servidor.
- POST /api/v1/field/heartbeat: {pending, sending, synced, blocked}, inteiros entre zero e um milhão. Persiste horário de recebimento do servidor e identificação da sessão.

A concessão é um registro de escopo, não um token que permita dispensar autenticação no upload. O ID da concessão exportado não concede acesso à API.

## Intenção de sincronização

```json
{
  "client_event_id": "a3a72ad0-6930-4dd2-a16b-19419bfbb113",
  "bib": "00152",
  "raw_captured_at": "2026-09-17T10:30:01.123Z",
  "capture_session_id": "a82cb86e-2d8a-4a14-bb77-ab01c08b4ed3",
  "grant_id": "356ce5ae-4f71-4ddc-97de-ded0a8999473",
  "clock": {
    "offset_ms": 15.4,
    "rtt_ms": 20.8,
    "measured_at": "2026-09-17T10:29:45.000Z",
    "uncertain": false
  }
}
```

grant_id e clock são enviados juntos. Sem os dois, a rota aceita uma intenção legada online, marcando incerteza. Isso permite recuperar a fila da Sprint 02 sem recriar UUID. source, confidence, organização, checkpoint e dispositivo não podem ser escolhidos pelo payload.

O contrato de POST /field/sync faz parte do OpenAPI em GET /api/v1/capture/openapi.json. Os schemas de request e response são usados diretamente pelo Fastify, além da validação de domínio. O contrato legado não foi removido.

A resposta inclui os campos anteriores, estimated_captured_at (nullable) e needs_review. A presença de revisão não impede status synced local: o servidor recebeu a evidência, mas ainda não a conciliou.

400/422 indicam contrato inválido; 401 interrompe sincronização para renovação/recuperação; 403 indica escopo/CSRF inválido; 409 indica conflito ou evento indisponível; 429/5xx/timeout mantêm o mesmo item para tentativa posterior. Campos extra e números como inteiros são rejeitados.

## Recebimento e flags

A sessão atual deve estar válida. Ela pode enviar uma intenção de sessão anterior somente quando pertence à mesma credencial. O servidor verifica o vínculo da concessão com a sessão original e com a janela do evento.

Flags append-only: possible_duplicate, time_uncertain, late_upload, recovery, outside_grant. Payload bruto permanece imutável. needs_review deriva da presença de qualquer flag. A futura resolução das flags pertence à Sprint 04.

Recebimento após validade da concessão é revisado mesmo que o aparelho declare uma captura anterior. Evento fechado ou janela encerrada também gera revisão. Relógio bruto nunca é tratado sozinho como prova de que houve autorização antes do fechamento.

## Recuperação e telemetria administrativa

GET /api/v1/events/:id/devices retorna cada credencial do evento com last_seen_at, contagens e stale. last_seen_at ausente ou maior que dois minutos implica stale=true; valores ausentes permanecem null.

POST /api/v1/events/:id/recovery recebe:
- reason: justificativa de 10 a 500 caracteres;
- package: {version:1, event_id, checkpoint_id, items};
- cada item: {payload, sha256}, usando a representação ordenada de packages/contracts/src/offline.ts.

Um lote tem de 1 a 100 itens e corpo de até 256 KiB. O cliente limita o arquivo total a 10 MB/10.000 itens e o divide em lotes. Cada lote é atômico; lotes concluídos não são revertidos se o seguinte falhar.

O hash é SHA-256 do JSON do payload ordenado, codificado em UTF-8. Não é assinatura. Hash incorreto rejeita o lote. Escopo desconhecido/estrangeiro é recusado. Um UUID com conteúdo diferente retorna conflito. Replays idênticos não duplicam observações, mas registram a recuperação e a revisão.

Credencial original revogada/expirada não impede importação pelo admin autorizado; a importação não autentica essa credencial. Eventos finalized/archived rejeitam importação até uma reabertura auditada existir.

## Migration e armazenamento

004_offline_recovery.sql acrescenta capture_grants, device_status, estimated_captured_at e timing nas observações e amplia os motivos de flag. As tabelas novas usam FORCE RLS. Runtime apenas lê/insere concessões; heartbeat permite atualização. Observações continuam sem UPDATE/DELETE para o runtime.

IndexedDB passa da versão 1 para 2, adicionando meta sem remover intents. Intenções legadas continuam legíveis. A máquina atual usa pending → sending → synced ou blocked; confirmed da Sprint 02 permanece reconhecido como confirmado. Contexto persistido não contém csrf_token, senha ou cookie.

O shell compilado usa service worker com cache identificado pelos arquivos da build. Não armazena respostas da API nem força skipWaiting. Atualizações aguardam o fim dos clientes antigos; registros locais não são apagados pela atualização. O processo de build inclui explicitamente index.html, manifesto, ícone e assets.
