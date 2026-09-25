# Sprint 02 — Registro de execução

Data local: 16/09/2026. Status: implementada e validada tecnicamente em desenvolvimento e homologação local HTTPS. A avaliação do usuário sobre a interface permanece disponível; esta entrega não equivale à liberação do MVP para campo.

## Entrega

S02-01 a S02-10 implementadas: credenciais por checkpoint/aparelho, sessões restritas, teclado, intenção durável local, envio manual online, idempotência, sinalização de duplicatas humanas, consulta administrativa mínima e contrato de gravação executável.

Foi adicionada a migration 003_manual_capture.sql e aplicada nos bancos locais de desenvolvimento, teste e homologação. Nenhuma migration anterior foi modificada.

## Evidências

- npm run check: lint, tipos, 4 testes unitários e build aprovados.
- npm run test:integration: 23 testes aprovados, incluindo regressões administrativas, banco real e 10 cenários da captura, além dos agrupamentos do node:test.
- 20 POSTs simultâneos com um UUID: 1 criação, 19 replays, 1 observação e 1 evento de auditoria.
- UUID com payload/sessão divergente retorna 409; duas intenções humanas concorrentes permanecem gravadas e ambas sinalizadas.
- Falha induzida na auditoria em banco de testes: nenhum registro parcial; retry com mesmo UUID cria a observação após remover a falha.
- Revogação, expiração, RLS sem tenant, imutabilidade por privilégios, contrato sem IA e restrição de histórico verificadas.
- npm run test:e2e:capture: jornada aprovada em http://127.0.0.1:5173 e https://localhost:5443.
- E2E: admin emite acesso; operador registra 00152; toque duplo gera uma intenção; armazenamento indisponível mantém visor; resposta perdida após commit preserva pendente; reload e retry confirmam uma única observação; modo offline desabilita captura nova; revogação bloqueia envio e mantém pendente.
- Sem erros JavaScript e sem transbordamento horizontal em viewport 390×844. Layout móvel inspecionado e ajustado para manter o botão de registrar visível; inspeção desktop realizada.
- Feedback local observado em uma amostra automatizada: 21 ms em desenvolvimento e 31 ms em homologação. É medição inicial da jornada, não percentil, SLA ou resultado em celular físico.

Artefatos locais ignorados pelo Git: tmp/sprint-02/dev/ e tmp/sprint-02/homolog/, com result.json e screenshots capture-mobile.png, capture-desktop.png, access.png e admin-passages.png. As imagens não exibem senha.

Testes reproduzíveis: tests/integration/capture.test.ts e tests/e2e/sprint-02.mjs. As fixtures são sintéticas e não apagam dados existentes. O E2E redefine a senha do admin sintético por recuperação local e cria uma corrida de demonstração.

## Ambiente e operação

Dev e homologação usam papel de runtime limitado. O certificado HTTPS permanece autoassinado, sem alteração de confiança do Windows. Não houve deploy público, execução em CI remota ou criação de commit/remote nesta sprint.

A instrumentação e validação foram realizadas nesta tarefa. Capacidade operacional real, responsáveis da corrida, cloud e gates de liberação continuam conforme as pendências anteriores; não foram inventadas confirmações de produto.

## Limites e sequência

Ver [guia de captura](../24-captura-manual-e-acessos.md) para restrições de recuperação entre sessões e relógio bruto. Não há IA, funcionamento offline completo, resultados oficiais, revisão administrativa ou exportação.

Próxima entrega: [Sprint 03](sprint-03-offline-e-recuperacao.md), com concessões offline, sincronização/reconciliação, relógios e recuperação autorizada de pendentes. Antes de campo, completar também as Sprints 04–06.

Contratos: [Sprint 02](../25-contratos-sprint-02.md). Uso: [captura e acessos](../24-captura-manual-e-acessos.md).
