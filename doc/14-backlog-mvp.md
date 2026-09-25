# Backlog executável do MVP

Status atual: **B0 em andamento**, com fundação técnica implementada e decisões/aceite pendentes; B1/B2 implementados na Sprint 01, com finalização dependente de B7; B3–B10 não iniciados. Ver [execução da Sprint 00](sprints/sprint-00-execucao.md). Estimativa relativa: P pequeno, M médio, G grande; não representa dias. Responsáveis são papéis a designar. Sequência abaixo reduz dependências; não implica entregas já aprovadas ou codificadas.

Execução detalhada: [plano de sprints](sprints/README.md), da Sprint 00 à Sprint 06. As sprints distribuem este backlog sem alterar a obrigatoriedade dos P0; B8 continua opcional.

## B0 — Preparar decisões e repositório (M)

Produto + liderança técnica. Fechar D01–D04 do registro de decisões; criar estrutura de aplicação, padrões, dependências fixadas, CI, ambiente local, `.env.example` e política de migrations. Saída: build reproduzível e teste de conexão com banco. Dependência: nenhuma.

## B1 — Identidade e isolamento (G)

Backend. Migrations de organização/usuário/membership/sessão; provisionamento do primeiro admin; login, logout, recuperação e autorização; isolamento de consultas e FKs. Saída: RF-01/02 com T01/02 passando. Dependência: B0.

## B2 — Eventos e checkpoints (M)

Full stack. CRUD e telas, modalidade única, janela de captura, ordenação, estados e bloqueios de alteração. Saída: RF-03/04 e T03. Dependência: B1.

## B3 — Credenciais e contexto de campo (M)

Backend + frontend. Emissão única de senha, código, validade, login restrito, sessão/dispositivo e revogação. Saída: RF-05; tentativas de trocar checkpoint falham. Dependência: B2.

## B4 — Núcleo de captura e auditoria (G)

Backend. Observação imutável, UUID idempotente, hash de payload, transação, classificação temporal, duplicidade humana e auditoria. Produzir OpenAPI validado. Saída: RF-07/09/13, T05/08/14. Dependência: B3.

## B5 — Teclado e persistência local (G)

Frontend. Teclado numérico, Enter, zeros à esquerda, feedback, fila IndexedDB, foco e histórico. Saída: RF-06/07; T04 e parte de T11. Dependência: B3 e contrato B4.

## B6 — Reconexão e recuperação (G)

Full stack. Retry, offset, estados da fila, concessão offline, conflitos, upload tardio, pacote de recuperação e importação administrativa. Saída: RF-08, T06/07/12. Dependência: B4/B5.

## B7 — Painel, revisão e exportação (G)

Full stack. Filtros, paginação, polling, auditoria legível, revisão com versão, solicitação pelo operador e CSV seguro. Saída: RF-10/11/12; T09/10. Dependência: B4; recuperação administrativa integra B6.

## B8 — Participantes mínimos (P, opcional)

Full stack. Cadastro simples, vínculo por número e marcação de desconhecidos. Saída: RF-14/T15. Dependência: B2/B4. Pode ser removido do piloto sem impedir digitação.

## B9 — Infraestrutura e hardening (G)

Liderança técnica + QA. Homologação, deploy, logs, alertas, backups/PITR, restauração, segurança e testes de carga. Saída: RNFs e T02/T11/T13 completos. Dependência: B1–B7. Infraestrutura básica começa em B0; esta etapa conclui verificação integrada.

## B10 — Piloto e aceite (M)

Produto + QA + coordenação. Executar runbook, ensaio de campo, reconciliação de todos os postos, coletar feedback e corrigir bloqueios. Saída: aceite do MVP com evidências e capacidade real registrada. Dependência: B9.

## Caminho crítico

B0 → B1 → B2 → B3 → B4/B5 → B6/B7 → B9 → B10. Sem sync, revisão ou teste de campo, temos protótipo, não MVP operacional.

## Definition of Ready / Done por item

Ready: regra compreendida, dependências disponíveis, critério de aceite e responsável definidos. Done: implementação revisada, testes do risco executados, migração/documentação atualizadas, ausência de segredos e comportamento demonstrado em homologação. Não encerrar item apenas porque a interface está desenhada.

## Atualização de escopo — 22/09/2026

Sprint 04 implementada conforme [registro de execução](sprints/sprint-04-execucao.md). RF-14/B8, cadastro mínimo de participantes (P1), foi adiado para F2 e não está concluído. O MVP manual continua aceitando números sem cadastro. A liberação operacional depende das Sprints 05 e 06.


## Ampliação antes do deploy — administração da plataforma

Adicionar o pacote [SA-01 a SA-06](38-plano-implantacao-super-admin.md): regras/arquitetura, acesso seguro, organizações, contas, painel/auditoria e homologação. Solicitado em 23/09/2026, ainda não implementado. Executar antes da implantação e do piloto, preservando os itens B0–B10 e os critérios existentes.
