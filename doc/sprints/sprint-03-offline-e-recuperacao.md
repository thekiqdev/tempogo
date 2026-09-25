# Sprint 03 — Offline, relógios e recuperação

Status: implementada e validada tecnicamente, incluindo 1.000 registros por 30 minutos offline. Ver [registro de execução](sprint-03-execucao.md). Ver [guia operacional](../26-offline-e-recuperacao.md) e [contratos](../27-contratos-sprint-03.md). Duração proposta: 2 semanas. Fase F1; backlog B6. Responsáveis: frontend, backend, QA e operação.

## Objetivo e incremento

Tolerar interrupção de conexão após preparação online, conservar intenções e reconciliar falhas de sessão, relógio e envio. O operador precisa saber o que está apenas no aparelho e o que chegou ao servidor.

## Entrada

Sprint 02 aceita, principalmente persistência local e idempotência. Consultar [sincronização](../10-sincronizacao-e-tempo.md), [perfis](../05-perfis-e-acessos.md) e [regras](../04-regras-de-negocio.md).

## Tarefas

- [x] S03-01 — Frontend: completar estados pending/sending/synced/blocked, recuperação após reload e retry com backoff/jitter usando os mesmos UUIDs e payloads.
- [x] S03-02 — Frontend: cache versionado da aplicação/PWA, preparação online e tratamento de quota; impedir atualização destrutiva durante operação.
- [x] S03-03 — Full stack: concessão local de escopo/validade, aviso de expiração, reautenticação e bloqueio de novas capturas fora da concessão.
- [x] S03-04 — Full stack: medição de offset/RTT, referência temporal, detecção de salto de relógio e classificação de horário incerto; conservar dado bruto.
- [x] S03-05 — Backend: uploads tardios em evento fechado, rejeições em evento finalizado/revogado e regras de reabertura; não confiar no horário do cliente como prova de validade.
- [x] S03-06 — Full stack: pacote local de recuperação sem tokens/senhas e fluxo administrativo mínimo de importação, com idempotência, justificativa e revisão obrigatória.
- [x] S03-07 — Frontend: logout com fila pendente, isolamento entre credenciais, manutenção dos itens bloqueados e orientação de contingência.
- [x] S03-08 — Full stack: heartbeat, última comunicação e contagens de fila; ausência de comunicação não significa fila vazia.
- [x] S03-09 — QA: T06/T07/T12, ensaio preliminar RNF-06 e regressão T05; documentar limites de navegador e tela fechada.

## Critérios de aceite

1. RF-08: login online, queda de rede, 100 capturas, reload e reconexão produzem todos os itens uma vez, com UUID e horário originais.
2. Reinício recupera itens em envio; timeout não duplica registro e resposta parcial não apaga outros itens.
3. Credencial revogada enquanto offline não envia automaticamente ao reconectar; dados são preservados e recuperáveis por admin autorizado.
4. Pacote recuperado é tratado como fonte não confiável, auditado e mantido em revisão; não concede poderes da credencial antiga.
5. Saltos de relógio, referência antiga e upload fora de ordem não substituem captura por recebimento silenciosamente.
6. Demonstrar ensaio de 1.000 itens por aparelho/30 minutos offline; confirmar capacidade nos dispositivos-alvo na Sprint 05.

## Verificação e demonstração

Executar captura com rede desligada, recarregar, revogar um acesso e recuperar via admin. Comparar contagens locais/remotas e hashes das intenções. Revisar evento encerrado/finalizado e expiração. Registrar aparelhos, versões, duração e perdas observadas, mesmo quando zero.

## Entregáveis e saída

Sincronização completa do MVP, recuperação administrativa mínima e limitações operacionais documentadas. Não promete login inicial offline, upload com tela fechada ou recuperação após exclusão do armazenamento. A interface consolidada de revisão desses itens será entregue na Sprint 04.

Próxima: [Sprint 04](sprint-04-gestao-e-auditoria.md). Aplicar a definição comum de pronto do [índice](README.md).
