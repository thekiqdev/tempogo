# Sprint 02 — Acesso de checkpoint e captura manual

Status: implementada e validada tecnicamente em desenvolvimento e homologação local HTTPS. Ver [registro de execução](sprint-02-execucao.md). Duração proposta: 2 semanas, a reestimar pela capacidade. Fase F1; backlog B3/B4/B5. Responsáveis: backend, frontend e QA.

## Objetivo e incremento

Completar a primeira jornada de ponta a ponta: admin emite código/senha, operador entra no ponto, digita número no teclado e vê o registro persistido; admin consulta a passagem. Esta entrega ainda não está liberada para campo com rede instável.

## Entrada

Sprint 01 aceita; eventos/checkpoints e escopo organizacional disponíveis. Referências: [interface](../06-jornadas-e-interface.md), [API](../09-contrato-api.md), [sincronização](../10-sincronizacao-e-tempo.md) e [testes](../12-qualidade-e-testes.md).

## Tarefas

- [x] S02-01 — Backend: credenciais por checkpoint/dispositivo, geração aleatória, senha mostrada uma vez, validade, revogação e login de campo.
- [x] S02-02 — Full stack: contexto restrito de sessão, identificação do dispositivo e tela de entrada por código/senha; nunca aceitar troca de checkpoint enviada pelo cliente.
- [x] S02-03 — Backend: migrations de observações, UUID, payload canônico, horários separados, origem manual e auditoria atômica.
- [x] S02-04 — Backend: idempotência por constraint/transação, retry idêntico e conflito de payload; detecção de possível duplicata humana com concorrência tratada.
- [x] S02-05 — Frontend: teclado numérico, apagar/limpar/Enter, zeros à esquerda, validação e proteção de toque duplo.
- [x] S02-06 — Frontend: persistir intenção em IndexedDB antes de limpar visor; congelar UUID/número/horário; distinguir salvo local de confirmado no servidor. Falha local mantém entrada visível.
- [x] S02-07 — Full stack: envio online, estados locais básicos e histórico da própria sessão. Em falha de rede, preservar pendentes e informar que a operação desconectada completa será entregue na Sprint 03.
- [x] S02-08 — Backend/frontend: consulta administrativa mínima autorizada para demonstrar os registros; painel completo fica na Sprint 04.
- [x] S02-09 — Backend: OpenAPI executável e validação de contrato; campo não escolhe origem IA nem confiança artificial.
- [x] S02-10 — QA: T04/T05/T08/T14 e partes aplicáveis de T01/T02/T11; medir feedback local inicial.

## Critérios de aceite

1. RF-05: credencial só autoriza seu ponto; revogação bloqueia próxima chamada; login inicial exige rede.
2. RF-06: `00152` permanece intacto; vazio/letras/nove dígitos falham; Enter/toque duplo não cria duas intenções.
3. RF-07/13: sucesso remoto só após commit; observação e auditoria são consistentes; captura e recebimento são distintos.
4. RF-09: 20 retries e requisições concorrentes criam uma passagem; UUID igual com conteúdo diferente retorna conflito.
5. Duas intenções distintas com número/ponto próximos são preservadas e sinalizadas, inclusive sob concorrência.
6. Admin consegue localizar o registro da demonstração; operador não vê dados de outra sessão/organização.

## Verificação e demonstração

Criar evento/ponto, emitir credencial, registrar em celular e verificar como admin. Simular timeout após commit e retry, armazenamento indisponível e revogação. Capturar resultados de testes e registros sanitizados.

## Entregáveis e saída

Fatia vertical manual online, persistência local inicial, contrato executável e controles de integridade. Não inclui garantia de recuperação offline, gestão completa de revisão ou exportação. Se o volume exceder duas semanas, dividir a sprint preservando idempotência e testes; atualizar sequência antes de prometer piloto.

Próxima: [Sprint 03](sprint-03-offline-e-recuperacao.md). Aplicar a definição comum de pronto do [índice](README.md).
