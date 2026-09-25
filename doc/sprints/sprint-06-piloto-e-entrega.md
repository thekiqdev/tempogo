# Sprint 06 — Piloto e entrega do MVP

Status: não iniciada. Duração proposta: 1 semana, condicionada à disponibilidade do piloto. Fase F1; backlog B10; gate final G1. Responsáveis: produto, coordenação de prova, QA e liderança técnica.

## Objetivo e incremento

Validar o MVP manual em uma operação representativa, corrigir bloqueios e formalizar a entrega com evidências e limites conhecidos. O produto deve ser utilizável pela equipe de prova, não apenas demonstrável pela equipe técnica.

## Entrada

Sprint 05 aceita; versão candidata identificada; dispositivos, operadores, evento e referência de conferência disponíveis. Política de dados e contingência definidas. Usar [runbook](../13-infraestrutura-e-operacao.md) e [critérios do piloto](../12-qualidade-e-testes.md).

## Tarefas

- [ ] S06-01 — Coordenação: conferir evento, checkpoints, credenciais, validade, largada, aparelhos, cache, relógio, energia e conexão alternativa.
- [ ] S06-02 — Operação/QA: treinar operadores e executar ensaio de registro/consulta/contingência com dados de teste separados dos reais.
- [ ] S06-03 — Coordenação: executar piloto representativo com observação independente de números/passagens; medir atraso humano, omissões e trocas de número.
- [ ] S06-04 — QA/operação: simular interrupção controlada de rede e recuperação sem comprometer a prova; comparar intenções locais, recebidas e revisadas.
- [ ] S06-05 — Admin/coordenação: encerrar, obter estado de todos os postos, reconciliar filas, revisar erros, exportar e finalizar. Registrar exceções justificadas.
- [ ] S06-06 — Desenvolvimento: corrigir defeitos bloqueantes encontrados, executar regressão afetada e repetir ensaio quando a correção alterar captura, tempo ou integridade.
- [ ] S06-07 — Produto: consolidar feedback, capacidade humana/operacional, métricas técnicas e limitações; separar melhorias futuras de correções obrigatórias.
- [ ] S06-08 — Liderança: identificar versão entregue, confirmar backup, suporte, monitoramento, acessos e rollback; entregar guias finais.
- [ ] S06-09 — Produto/operação: registrar aceite G1 com data/responsáveis e checklist abaixo; atualizar backlog, roadmap e decisões.

## Checklist de entrega G1

- [ ] Todos os RF P0 aceitos com evidências; P1 entregue ou explicitamente adiado.
- [ ] Admin configura eventos e checkpoints sem intervenção técnica cotidiana.
- [ ] Acesso por código/senha libera somente o ponto autorizado e o teclado manual.
- [ ] Capturas, retries e interrupção de rede conciliados; sem perda inexplicada ou duplicata técnica no roteiro.
- [ ] Erros humanos identificados e tratados por revisão auditável; limitação de precisão manual comunicada.
- [ ] Exportação, finalização e reabertura controlada verificadas.
- [ ] Restauração, segurança e operação aprovadas na Sprint 05 permanecem válidas para a versão entregue.
- [ ] Nenhum defeito bloqueante aberto; defeitos menores têm responsável e prioridade.
- [ ] Coordenação treinada e suporte designado; versão, ambiente e documentação entregues.
- [ ] IA ausente; nenhuma funcionalidade futura apresentada como concluída.

## Evidências e demonstração final

Relatório do piloto com local/data, versão, quantidade real de participantes/postos/aparelhos, registros esperados/recebidos/revisados, incidentes, tempos observados e limitações. Anexar exportação sanitizada, reconciliação e aceite nominal. Proteger dados pessoais nas evidências.

## Regra de saída

Se houver bloqueio, G1 permanece pendente; reservar nova rodada de correção/ensaio e atualizar previsão. Não encerrar por término da semana. Se aprovado, marcar MVP entregue e abrir planejamento de F2 separadamente: esta série termina na entrega manual e não autoriza antecipar IA.

Referência: [roadmap completo](../15-roadmap.md) e [definição comum de pronto](README.md).
