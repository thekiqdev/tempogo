# Qualidade, testes e aceite do piloto

Plano de verificação do MVP. A regressão automatizada das Sprints 01–05, carga, PITR e limitações estão no [registro da Sprint 05](sprints/sprint-05-execucao.md). Ensaios de aparelhos reais e condições operacionais continuam pendentes. Evidências devem incluir versão do código, ambiente, dispositivos, dados sintéticos e resultado observado.

## Estratégia

Unidade para regras de estado, números, tempo e revisão. Integração com PostgreSQL real para unicidade, rollback, RLS, isolamento e concorrência. Testes de contrato para API. E2E para admin e campo. Ensaio em dispositivos reais para armazenamento, foco, teclado, luz ambiente e reconexão.

## Cenários críticos e rastreabilidade

- **T01 / RF-01,05:** login correto/incorreto, recuperação, expiração, logout e revogação durante uso. Nenhuma escrita autorizada após revogação online.
- **T02 / RF-02,10,12:** duas organizações com IDs conhecidos; tentar GET, PATCH, POST, filtros, exportação e acesso com conexão reutilizada. Zero vazamento.
- **T03 / RF-03,04:** configurar evento completo, validar ordenação, iniciar, fechar, reabrir e finalizar; alterações proibidas falham sem efeitos parciais.
- **T04 / RF-06,07:** vazio, letras, oito/nove dígitos, `00152`, Enter/toque duplo, armazenamento cheio e IndexedDB indisponível; sem falso sucesso.
- **T05 / RF-09:** 20 retries, requisições simultâneas e timeout após commit; exatamente uma passagem. UUID igual/payload divergente dá 409.
- **T06 / RF-08:** 100 entradas offline, reload, fechar/reabrir aplicativo, reconectar; mesmas intenções e horários. Ampliar para 1.000 no ensaio de capacidade.
- **T07 / RF-08,05:** revogar credencial enquanto offline; upload negado; recuperação por admin preserva itens e exige revisão.
- **T08 / RF-07,10:** dois dispositivos registram o mesmo número/ponto quase juntos; preservar duas observações e sinalizar revisão, incluindo corrida concorrente.
- **T09 / RF-11,13:** duas revisões simultâneas; apenas versão compatível confirma; histórico antes/depois/motivo completo. Rollback não deixa revisão sem auditoria.
- **T10 / RF-12:** CSV reproduz filtros e status; zeros à esquerda preservados como dados, alertando sobre importação como texto; conteúdo de fórmula neutralizado.
- **T11 / RNF-03:** Chrome Android, Safari iOS e desktop; larguras pequenas, teclado físico, foco, leitor de tela básico e sessão longa.
- **T12 / regras temporais:** mudança de fuso, meia-noite, salto de relógio, offset antigo, upload fora de ordem e após encerramento; nunca usar recebimento como substituto silencioso.
- **T13 / RNF-05:** restaurar backup em ambiente isolado, reaplicar WAL quando disponível, comparar contagens e medir RPO/RTO reais.
- **T14 / RF-13:** buscar senha/token em logs, erros e exportações; resultado esperado zero ocorrências.
- **T15 / RF-14:** número sem cadastro é capturado; cadastro duplicado por evento falha; mesmo número em outro evento é permitido.

## Carga

Dados: 1 organização piloto e outra para isolamento, 1.000 participantes sintéticos, 10 checkpoints, 20 dispositivos. Carga controlada: 20 capturas/s agregadas por 15 minutos, consultas de painel simultâneas e burst de reconexão de 1.000 itens por dispositivo com concorrência limitada.

Medir p50/p95/p99, erros, contenção, CPU, conexões, backlog e completude após retries. Critério inicial: metas RNF-02, zero duplicatas técnicas e nenhuma perda após conciliação. Documentar capacidade humana separadamente da capacidade da API. Não afirmar que um operador registra 20 atletas por segundo.

## Ensaio de campo

Usar participantes/voluntários em fluxo controlado com números legíveis e observador independente. Comparar o registro com referência conhecida, medir omissões, troca de números e atraso de digitação. Simular pelotão, chuva/luz adversa sem comprometer pessoas, bateria baixa e perda de rede. Se equipe não acompanha o fluxo, reduzir promessa de uso ou aumentar postos antes do evento real.

## Liberação

Sem falhas críticas de autorização, perda, duplicação ou restauração. Todos os P0 e cenários correspondentes aprovados; T15 é exigido somente se P1 implementado. Operador treinado, pendências classificadas, plano de contingência pronto e aprovação do responsável da prova registrada. Relatório deve dizer o que não foi testado.
