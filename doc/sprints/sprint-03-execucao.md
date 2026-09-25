# Sprint 03 — Registro de execução

Status: implementada e validada tecnicamente. Implementação e ensaios em 16–17/09/2026; fechamento documental em 22/09/2026. A liberação para uso em corrida real ainda depende das Sprints 04–06.

## Entrega

S03-01 a S03-09 concluídas no escopo desta sprint:

- Fila pending/sending/synced/blocked, restauração de envio interrompido e retry com backoff/jitter usando os mesmos UUIDs.
- Shell compilado com cache versionado, manifesto e preparação online; atualização sem skipWaiting e migração IndexedDB sem exclusão de intenções.
- Concessão de até duas horas, limitada pela sessão, com bloqueio de captura fora da validade e renovação pela mesma credencial.
- Medição de offset/RTT, detecção de salto e classificação temporal incerta, mantendo captura bruta e estimativa separadas.
- Recebimento tardio em revisão; revogação impede sincronização normal; finalizado/arquivado recusam recebimento.
- Exportação sem segredos e importação administrativa auditada, idempotente e obrigatoriamente em revisão.
- Preservação de itens bloqueados, proteção de logout/troca de acesso e heartbeat com estado desconhecido quando desatualizado.

Migration 004_offline_recovery.sql aplicada aos ambientes locais. As migrations anteriores não foram alteradas.

## Evidências de validação

- npm run check aprovado: lint, tipos, 7 testes unitários e build.
- npm run test:integration: 33 testes aprovados (incluindo agrupamentos do node:test), com regressão administrativa e de captura.
- tests/e2e/sprint-02.mjs: regressão da captura online, zeros à esquerda, toque duplo, quota indisponível, resposta perdida e revogação aprovada em desenvolvimento.
- tests/e2e/sprint-03.mjs: 100 capturas offline, reload e sincronização com payloads intactos e 100 IDs remotos únicos; nenhum erro JavaScript.
- tests/e2e/sprint-03-edge.mjs: respostas parciais, perda de resposta após commit, salto de relógio, expiração, revogação seguida de reload offline e migração v1→v2 preservando pendência aprovados.
- Inspeção visual da tela móvel bloqueada: estado do acesso e botão de captura desabilitado apresentados corretamente. Ensaios de viewport móvel não substituem telefone físico.

### Ensaio prolongado de RNF-06

Executado com tempo real em 17/09/2026, Microsoft Edge 153.0.4234.32, Windows, navegador automatizado e viewport móvel, na homologação local HTTPS.

Resultado persistido em tmp/sprint-03/homolog-soak/result.json:

- 1.000 intenções gravadas localmente.
- 1.800 segundos (30 minutos) desconectado.
- UUIDs e payloads originais preservados.
- 1.000 IDs remotos únicos após reconexão.
- Zero tentativas de upload após a revogação do acesso no cenário de recuperação.
- Nenhum erro JavaScript.
- Importação administrativa e replay do pacote sem duplicação, com revisão obrigatória.

Não foi utilizado avanço artificial de relógio nesse ensaio. Testes controlados de salto de relógio estão separados no cenário edge. Uma tentativa anterior foi interrompida durante reinicialização do ambiente; o resultado acima corresponde à repetição concluída.

Artefatos ignorados pelo Git: tmp/sprint-03/homolog/, tmp/sprint-03/homolog-soak/ e tmp/sprint-03-edge/homolog/. Os pacotes exportados de teste contêm somente dados sintéticos. Não incluir esses pacotes em logs públicos.

## Correções encontradas durante os testes

O cache inicialmente não incluía index.html; a lista explícita de precache corrigiu o reload offline. O teste de mudança de relógio identificou que o agendamento de retry usava Date.now; os intervalos passaram a usar performance.now. Um bloqueio recebido do servidor agora é preservado no contexto local, impedindo liberação por reload desconectado.

## Reprodução

Com Docker e homologação local disponíveis:

```powershell
npm.cmd run check
npm.cmd run test:integration
npm.cmd run test:e2e:offline
node tests/e2e/sprint-03-edge.mjs

# Ensaio real de 30 minutos
$env:OFFLINE_COUNT = '1000'
$env:SOAK_MINUTES = '30'
npm.cmd run test:e2e:offline
```

As variáveis devem ser removidas da sessão do terminal depois do ensaio, se não quiser repeti-lo. Os testes E2E redefinem a senha do admin sintético por recuperação local; não executar em produção. E2E_EMAIL permite escolher outra conta sintética quando dois ensaios ocorrem em paralelo, para evitar invalidar a sessão administrativa do primeiro.

## Limites e próxima sprint

Operação offline exige preparação online e um shell compilado. A homologação local usa certificado autoassinado; o teste permite a exceção somente em um navegador descartável. Nenhuma confiança foi instalada no Windows. Celulares de campo precisam de HTTPS confiável.

Não há garantia com tela fechada, primeiro login offline, armazenamento apagado ou navegador encerrado pelo sistema. A precisão temporal não é oficial. Suspensão, quota real, bateria e capacidade nos aparelhos-alvo serão verificadas na Sprint 05.

A Sprint 04 consolida painel, revisão, conciliação, exportação e reabertura auditada. Escala da corrida, responsáveis operacionais, cloud e liberação final continuam pendentes conforme o planejamento. Não houve publicação pública, commit ou CI remota nesta sprint.

Uso: [guia offline e recuperação](../26-offline-e-recuperacao.md).
API: [contratos da Sprint 03](../27-contratos-sprint-03.md).
