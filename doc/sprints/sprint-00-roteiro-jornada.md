# Sprint 00 — Roteiro da primeira jornada

Roteiro de aceite futuro, preparado na Sprint 00. Login, eventos e captura ainda não foram implementados.

## Preparação

Usar dados sintéticos: organizações A e B, um admin para cada uma, corrida de rua com uma modalidade sem voltas, largada/intermediário/chegada e número 00152. Cadastro de participante não deve ser pré-condição da captura.

## Demonstração ao fim da Sprint 02

1. Provisionar admin A sem segredo fixo no código.
2. Entrar como admin A e criar evento rascunho.
3. Cadastrar checkpoints ordenados, preparar/iniciar conforme regras e registrar largada.
4. Emitir código/senha para o ponto intermediário.
5. Entrar como operador desse ponto em outro navegador/dispositivo.
6. Digitar 00152 no teclado, confirmar e distinguir persistência local da remota.
7. Reenviar a mesma intenção após timeout e verificar uma única passagem.
8. Consultar a passagem como admin A com horário de captura e recebimento separados.
9. Tentar consultar pela organização B e alterar o checkpoint da sessão de campo: ambos devem falhar.
10. Revogar acesso e verificar bloqueio na próxima requisição.

## Complementos por sprint

Sprint 03: rede interrompida, reload, reconexão e pacote recuperado.
Sprint 04: revisão concorrente, exportação e fechamento conciliado.
Sprints 05/06: carga, aparelhos reais, restauração e uso na primeira corrida de rua.

## Reestimativa inicial

Manter Sprint 01 em duas semanas indicativas para identidade/configuração. Sprint 02 continua em duas semanas como hipótese, com maior risco pelo acúmulo de credenciais, API e teclado. Reestimar após login/configuração estarem demonstráveis, antes de comprometer data. A equipe real e disponibilidade de operação ainda não foram informadas; não há base para converter as faixas em compromisso.
