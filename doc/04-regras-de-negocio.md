# Regras de negócio e cronometragem

## Estados do evento

`draft → ready → running → closed → finalized → archived`.

- `draft`: edição livre e configuração; registros somente no modo de ensaio separado.
- `ready`: estrutura validada e credenciais distribuídas; sem captura real.
- `running`: captura habilitada. Horário de largada real registrado pelo admin em UTC, com auditoria.
- `closed`: não permite novas capturas; aceita sincronização tardia de capturas declaradas dentro da janela da prova, sempre em revisão quando recebidas após fechamento.
- `finalized`: exportação consolidada; novos uploads de campo são bloqueados e mantidos no dispositivo para conciliação assistida.
- `archived`: consulta somente. Admin pode reabrir para `closed`, com motivo, criando nova versão de resultado antes de qualquer correção.

`ready → draft` exige revisão de configuração; `closed → running` exige motivo e nova janela de captura. Correções de tempo de largada após início geram revisão e recálculo, nunca substituição silenciosa. Não permitir alterar ordem, modalidade ou identidade do checkpoint durante a prova; corrigir estrutura somente em manutenção controlada e revalidar dados.

## Número de peito

String de 1 a 8 dígitos no MVP; preservar zeros à esquerda. `0152` e `152` são números distintos até decisão expressa sobre normalização. O mesmo número pode existir em eventos diferentes. Não vincular atleta de outro evento por semelhança. O limite e política de zeros devem ser confirmados antes da interface final.

## Registro e validade

Separar **observação bruta** (o que foi digitado), **revisões** (decisões posteriores) e **projeção vigente** (o valor exibido nas consultas). Toda observação é durável e tem procedência. Invalidação não apaga a observação. Situações: `accepted`, `needs_review`, `invalidated`; confirmação de persistência não significa aprovação esportiva.

Ao confirmar, congelar horário estimado de captura; o horário de recebimento no servidor não o substitui. Operador não escolhe horário retroativo na tela rápida. Inserção retrospectiva é uma ação administrativa auditada, com justificativa e referência da fonte.

## Duplicatas

Duplicata técnica = mesmo `client_event_id`; idempotência deve impedi-la. Possível duplicata humana = duas intenções distintas com mesmo número/ponto em até 5 segundos (janela proposta); preservar ambas e marcar para revisão. Verificar concorrência com bloqueio transacional por evento/checkpoint/número ou mecanismo equivalente. Nunca descartar só por proximidade temporal.

Como não há voltas no MVP, múltiplas passagens válidas no mesmo ponto precisam de escolha explícita antes de eventual cálculo consolidado. Em F2, passagem recebe ocorrência de percurso/volta; não incrementar volta a cada retry ou leitura de câmera.

## Inconsistências

Registrar como pendente: número desconhecido quando há lista de participantes, relógio sem referência confiável, repetição suspeita, captura fora da janela, checkpoint fora de sequência e envio tardio. Dados malformados ou escopo não autorizado são rejeitados, não aceitos como pendência.

Ausência de passagem significa dado ausente, não abandono, fraude ou desclassificação. Nenhuma dessas decisões deve ser automática no MVP.

## Cálculos futuros (F2)

- Tempo bruto = chegada válida − largada real da modalidade/bateria.
- Tempo líquido = chegada válida − passagem individual válida na largada; sem ela, mostrar indisponível, sem substituir pelo bruto silenciosamente.
- Parcial = passagem atual − passagem anterior válida da sequência.
- Pace = segundos do trecho ÷ quilômetros do trecho; velocidade = quilômetros ÷ horas.
- Distância zero, tempo negativo, lacunas ou ambiguidades bloqueiam o cálculo afetado.
- Empates não são resolvidos por ordem de upload ou ID. Critério esportivo deve ser definido com o organizador antes de rankings.

Persistir timestamps com milissegundos não implica precisão de milissegundos. Atraso de digitação e observação humana não é corrigido por sincronização de relógio. No MVP, exportar passagens como operacionais/provisórias.
