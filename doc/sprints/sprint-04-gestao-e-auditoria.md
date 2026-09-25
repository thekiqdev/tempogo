# Sprint 04 — Painel, revisão e exportação

Status: implementada e validada tecnicamente em 22/09/2026. Ver [execução e evidências](sprint-04-execucao.md). Duração proposta: 2 semanas. Fase F1; backlog B7 e B8 opcional. Responsáveis: full stack, QA e produto/operação.

## Objetivo e incremento

Permitir acompanhar a prova, resolver inconsistências, corrigir dados com histórico e consolidar a exportação. Ao final, a jornada funcional do MVP está completa em homologação, ainda sujeita à validação operacional.

## Entrada

Sprint 03 aceita; passagens e recuperações disponíveis. Referências: [requisitos](../03-requisitos-e-aceite.md), [modelo de dados](../08-modelo-de-dados.md), [API](../09-contrato-api.md) e [operação](../13-infraestrutura-e-operacao.md).

## Tarefas P0

- [x] S04-01 — Full stack: painel paginado com filtros por número, checkpoint, período e situação; horário de captura/recebimento e última atualização explícitos.
- [x] S04-02 — Full stack: contagens, estado conhecido dos dispositivos, polling e pendências, sem declarar aparelho ausente como conciliado.
- [x] S04-03 — Backend: revisões imutáveis, projeção efetiva, motivo obrigatório, versão esperada e idempotência da revisão após timeout.
- [x] S04-04 — Frontend: detalhe antes/depois, corrigir número/horário, invalidar/aceitar e mostrar autor/data/motivo.
- [x] S04-05 — Full stack: solicitação de revisão pelo operador restrita à sua passagem; admin resolve duplicatas humanas e itens recuperados.
- [x] S04-06 — Full stack: CSV autorizado e filtrado, fuso/origem/situação, neutralização de fórmulas e instrução de importação do número como texto.
- [x] S04-07 — Backend/frontend: auditoria legível de configuração, credenciais, captura, recuperação e revisão, sem expor segredos.
- [x] S04-08 — Full stack: fechamento, conciliação por dispositivo, finalização e reabertura auditada; finalizar exige conciliação ou exceção com motivo.
- [x] S04-09 — QA: T09/T10, T02 sobre filtros/exportação e T03/T07 completos; testar revisão repetida após timeout e versões concorrentes.

## Tarefa opcional P1

- [ ] S04-10 — Participantes mínimos: número único por evento e nome opcional, captura de desconhecido sem bloqueio e T15. Executar somente após P0; se adiada, registrar RF-14/B8 como adiados para F2, sem apresentar requisito como concluído.

S04-10 / RF-14 / B8: adiado para F2. Captura sem cadastro continua permitida.

## Critérios de aceite

1. RF-10: consulta reproduz filtros, mostra pendências e não vaza dados por IDs, paginação ou exportação.
2. RF-11: correção mantém original, motivo, ator e data; edição concorrente conflita sem sobrescrever silenciosamente.
3. RF-12: CSV corresponde à consulta autorizada, preserva informações temporais e impede injeção de fórmula.
4. RF-13: histórico permite explicar como o valor vigente foi obtido; auditoria não é editável na aplicação.
5. Finalização bloqueia novas capturas e respeita pendências; reabertura gera trilha e permite conciliação controlada.
6. Se P1 entrar, ausência de participante não impede registrar número; não inferir fraude de número desconhecido.

## Verificação e demonstração

Simular prova com passagens aceitas, duplicadas, recuperadas e erradas. Corrigir duas sessões concorrentes, reconciliar postos, exportar e finalizar. Guardar CSV sintético, trilha de auditoria e evidência de testes.

## Entregáveis e saída

Fluxo administrativo completo e candidato funcional do MVP. Rankings, cálculo oficial, importação de inscrições em lote e IA continuam fora. Dependências P0 pendentes impedem iniciar a liberação operacional, embora tarefas independentes de infraestrutura possam avançar.

Próxima: [Sprint 05](sprint-05-qualidade-e-operacao.md). Aplicar a definição comum de pronto do [índice](README.md).
