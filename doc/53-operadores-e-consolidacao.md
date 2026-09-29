# Operadores e passagens consolidadas

## Acessos

As telas do checkpoint e da aba Acessos compartilham a mesma gestão. Cada acesso identifica um aparelho e, opcionalmente, seu operador. Credenciais anteriores sem operador continuam válidas. A identificação do operador é informativa: não é uma conta pessoal autenticada.

A lista separa validade da credencial e comunicação do aparelho. O último heartbeat informa fila pendente, envios e bloqueios. Comunicação com mais de dois minutos é apresentada como desatualizada, sem afirmar que o aparelho está desligado ou que a fila está vazia. Uma credencial com várias sessões válidas gera um aviso: use uma credencial por aparelho.

Redefinir revoga a credencial anterior e cria outra em transação; preservar o nome permite identificar o aparelho, mas os identificadores técnicos continuam distintos. Sincronize filas antes da troca. A tela permite consultar os acessos expirados e revogados. Não reutiliza filas de outra credencial.

## Consolidação

A interface abre `observations?view=consolidated`. `view=records` (padrão da API, preservado para compatibilidade) lista todos os registros. O CSV acompanha a visualização e os filtros escolhidos, com identificação de operador, aparelho, credencial e quantidade de observações.

O agrupamento considera organização, evento, checkpoint, número vigente e origem de captura. Usa o horário vigente: revisão explícita, senão horário estimado do servidor, senão horário bruto. O primeiro horário inicia uma janela inclusiva de cinco segundos. Não existe encadeamento ilimitado: capturas nos segundos 0, 4 e 8 formam grupos [0,4] e [8]. A ordem de recebimento desempata horários iguais; o ID desempata o restante.

Os grupos são calculados sobre os registros do evento antes dos filtros e da paginação. O filtro de período considera o horário da primeira captura. Capturas recebidas offline podem mudar o primeiro registro e a composição dos grupos. Não é um resultado oficial de cronometragem.

Uma duplicidade isolada deixa de ser pendência na visão consolidada. Relógio incerto, recuperação, envio tardio, fora da autorização e pedidos de revisão não resolvidos mantêm a passagem pendente. A conciliação do evento usa as pendências consolidadas; continua exigindo a conciliação de todos os aparelhos.

Todos os registros originais continuam imutáveis e acessíveis. A expansão do grupo mostra suas origens e permite revisar cada registro. Invalidar um registro o retira da disputa pela primeira captura; ele permanece separado como invalidado. Alterar horário ou número recalcula os grupos. Revisões permanecem auditadas. As flags de duplicidade originais não são apagadas.

Origens diferentes não são agrupadas entre si. A API de captura permanece exclusivamente manual: esta entrega não habilita câmera nem reconhecimento por IA.

## Migração e validação

Aplicar `013_access_operators.sql` antes da nova API (`npm run migrate`, ou `npm run db:migrate` no desenvolvimento). Não são necessárias novas variáveis de ambiente.

Testes cobrem operadores independentes, heartbeat separado, primeira captura recebida depois, limite de cinco segundos sem encadeamento, paginação, CSV, revisão, isolamento entre organizações e revogação independente. Navegador cobre criação, redefinição, histórico, dois operadores e layouts mobile/desktop. Volume extremo de câmeras não foi homologado nesta entrega.
