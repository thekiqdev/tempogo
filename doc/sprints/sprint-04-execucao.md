# Sprint 04 — Registro de execução

Status: implementada e validada tecnicamente em 22/09/2026, em desenvolvimento e homologação local HTTPS. S04-01 a S04-09 entregues. A validação operacional e a liberação em corrida real permanecem nas Sprints 05 e 06.

## Entrega

- Painel com filtros, paginação, contagens e atualização a cada 15 segundos.
- Revisões imutáveis de número, horário e disposição, motivo obrigatório, histórico antes/depois e autor.
- Versão esperada e versão de evidências para impedir revisão sobre informação desatualizada; repetição idempotente após timeout.
- Solicitações de operador restritas à própria sessão, sem modificar a captura.
- CSV filtrado, com zeros preservados como texto, fuso/origem/situação, proteção contra fórmulas e auditoria.
- Auditoria paginada e legível para configuração, acessos, captura, recuperação, revisão e finalização.
- Conciliação explícita de aparelhos, finalização com checagem de pendências, exceção justificada e reabertura para coleta fechada.

Migration 005 aplicada aos bancos locais. Nenhuma migration anterior foi alterada. RF-14/B8/S04-10 (cadastro mínimo de participantes, P1) adiado para F2. Captura continua aceitando número sem cadastro.

## Evidências

- npm run check: lint, tipos, 7 testes unitários e build aprovados.
- npm run test:integration: 43 testes aprovados, incluindo agrupamentos node:test.
- Novos testes cobrem filtros e paginação, isolamento entre organizações em leitura/exportação, fórmula CSV, zeros, solicitação de outra sessão negada, repetição concorrente da revisão, conflitos de versão/evidência, preservação do original e alteração de horário.
- Falha injetada na auditoria desfaz a revisão; repetir o mesmo identificador depois grava uma única revisão. Runtime não atualiza nem exclui revisões/solicitações/conciliações.
- Duplicata e recuperação conservam suas flags depois da análise; projeção deixa de exigir revisão. Nova solicitação reabre a pendência.
- Conciliação recusa aparelho ausente ou com pendências. Finalização recusa revisão pendente mesmo com exceção; finalizado bloqueia captura/correção e reabertura invalida confirmação anterior.
- tests/e2e/sprint-04.mjs aprovado em HTTP de desenvolvimento e HTTPS local: operador solicita, admin corrige, resposta perdida após commit, retry mantém versão 1, filtro, download de CSV, conciliação, finalização, reabertura e auditoria.
- Interface conferida em desktop e 390 px, sem overflow horizontal ou erros JavaScript.

Artefatos locais sintéticos em tmp/sprint-04/dev e tmp/sprint-04/homolog: result.json, passagens.csv, review-desktop.png, review-mobile.png, finalized.png e audit.png. A pasta tmp é ignorada pelo Git; os testes reproduzem os artefatos. Os CSVs contêm somente dados sintéticos.

## Reproduzir

```powershell
npm run db:migrate
npm run check
npm run test:integration
npm run test:e2e:management
npm run homolog:up
$env:E2E_BASE_URL='https://localhost:5443'
$env:E2E_MAIL_URL='http://127.0.0.1:8026'
npm run test:e2e:management
```

E2E usa administradores sintéticos e redefine suas senhas pelo Mailpit local. Não executar testes com o mesmo administrador em paralelo. HTTPS local usa certificado autoassinado, com exceção restrita ao contexto do navegador de teste; nenhuma confiança foi instalada no Windows.

## Próxima etapa

Sprint 05: consolidar qualidade, desempenho, segurança, backup/restauração, observabilidade e operação. Sprint 06: ensaio de campo, treinamento e aceite. Não houve publicação externa, integração de IA ou cálculo de resultado oficial.

Consulte [guia operacional](../28-painel-revisao-e-conciliacao.md), [contratos](../29-contratos-sprint-04.md) e [plano da Sprint 04](sprint-04-gestao-e-auditoria.md).
