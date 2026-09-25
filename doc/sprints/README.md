# Sprints até a entrega do MVP

Versão 0.1 • 16/09/2026 • Planejamento proposto. Sprint 00 em andamento, com fundação técnica implementada; Sprint 01 implementada e validada em desenvolvimento e homologação local HTTPS; Sprint 02 implementada e validada nos dois ambientes locais; Sprint 03 implementada e validada, incluindo ensaio offline de 30 minutos; Sprint 04 implementada e validada em desenvolvimento e homologação HTTPS; Sprint 05 com entrega técnica implementada e homologação local concluída e deploy a cargo do usuário, mantendo condições operacionais abertas; Sprint 06 não iniciada. Ver [execução da Sprint 05](sprint-05-execucao.md). Ver [execução da Sprint 04](sprint-04-execucao.md). Ver [execução da Sprint 03](sprint-03-execucao.md). Ver [execução da Sprint 02](sprint-02-execucao.md). Ver [execução da Sprint 00](sprint-00-execucao.md).

Sete sprints, da Sprint 00 à Sprint 06, cobrem a fundação e a entrega do MVP manual. Não incluem IA, rankings oficiais, múltiplas modalidades, voltas ou funcionalidades comerciais da fase F2 em diante.

## Sequência e duração indicativa

1. [Sprint 00 — Fundação e decisões](sprint-00-fundacao.md): 1 semana; semana relativa 1; B0; gate G0.
2. [Sprint 01 — Admin, organizações e configuração](sprint-01-admin-e-configuracao.md): 2 semanas; semanas 2–3; B1/B2.
3. [Sprint 02 — Acesso de checkpoint e captura manual](sprint-02-captura-manual.md): 2 semanas; semanas 4–5; B3/B4/B5.
4. [Sprint 03 — Offline, relógios e recuperação](sprint-03-offline-e-recuperacao.md): 2 semanas; semanas 6–7; B6.
5. [Sprint 04 — Painel, revisão e exportação](sprint-04-gestao-e-auditoria.md): 2 semanas; semanas 8–9; B7 e B8 opcional.
6. [Sprint 05 — Qualidade e preparação operacional](sprint-05-qualidade-e-operacao.md): 2 semanas; semanas 10–11; B9.
7. [Sprint 06 — Piloto e entrega do MVP](sprint-06-piloto-e-entrega.md): 1 semana; semana 12; B10; gate G1.

Base de planejamento: duas pessoas full stack, produto/operação disponíveis e apoio de QA. As 12 semanas são uma hipótese dentro da faixa revisada de 7–13 semanas do [roadmap](../15-roadmap.md), não uma data contratada. O detalhamento reserva 11 semanas para F1, uma a mais que seu teto anterior, incluindo o piloto final. Não há data de início definida. Dependências externas, disponibilidade do piloto e capacidade real podem ampliar esse prazo. A Sprint 02 concentra trabalho significativo e deve ser reestimada ao final da Sprint 01.

Se o trabalho não couber, dividir a sprint ou alterar a previsão; não remover testes de integridade, isolamento, recuperação ou o piloto para manter a data. Cadastro de participantes é P1 e pode ser adiado para F2. Todo o restante P0 continua obrigatório para G1.

## Como executar

- Antes de iniciar: validar dependências, capacidade, responsáveis nominais e decisões pendentes; selecionar tarefas da sprint.
- Durante: atualizar checkboxes somente com evidência; registrar bloqueios, mudanças e defeitos na própria sprint ou ferramenta de gestão vinculada.
- Ao encerrar: demonstrar incremento em homologação, executar os testes previstos, registrar evidências e revisar a estimativa seguinte.
- Tarefa iniciada e não aceita volta ao planejamento seguinte com dependências explícitas; não marcar como concluída por haver código parcial.
- Cada pessoa pode assumir mais de um papel. “Backend”, “frontend” e “QA” representam responsabilidades, não exigem contratação de uma pessoa por papel.

Segurança, auditoria e testes acompanham cada incremento. A Sprint 05 consolida e verifica esses controles, não inaugura seu desenvolvimento. Infraestrutura básica começa na Sprint 00; homologação utilizável deve existir na Sprint 01.

## Rastreabilidade de requisitos

- RF-01/02: Sprint 01; regressão nas Sprints 02–05.
- RF-03/04: estrutura na Sprint 01; comportamento com passagens nas Sprints 02–04; fechamento completo na Sprint 04.
- RF-05/06/07/09: Sprint 02; cenários desconectados na Sprint 03.
- RF-08: Sprint 03; capacidade e dispositivos reais na Sprint 05.
- RF-10/11/12: Sprint 04; consulta mínima de demonstração já na Sprint 02.
- RF-13: infraestrutura na Sprint 01, captura na Sprint 02, recuperação na Sprint 03 e revisão na Sprint 04.
- RF-14: Sprint 04, apenas se houver capacidade após P0.
- RNF-01/04: desde Sprint 01; RNF-02/03: desde captura; RNF-05: preparação desde Sprint 00; RNF-06: Sprint 03. Aceite integrado de todos na Sprint 05 e confirmação operacional na Sprint 06.

## Definição comum de pronto

Critérios da sprint atendidos; revisão técnica; testes relevantes executados; migrations e contratos atualizados; demonstração em homologação; ausência de segredos; documentação ajustada; defeitos e limitações registrados. Para o MVP: todos os P0 aceitos, restauração demonstrada e piloto aprovado. Detalhes em [requisitos](../03-requisitos-e-aceite.md), [testes](../12-qualidade-e-testes.md) e [backlog](../14-backlog-mvp.md).

## Registro de encerramento de cada sprint

Preencher na execução: período real, responsáveis, tarefas concluídas/adiadas, versão ou commit, ambiente, evidências dos testes e demonstração, defeitos abertos, decisão de aceite e impactos na próxima sprint. As evidências das Sprints 00, 01, 02 e 03 estão nos respectivos registros de execução.


## Ampliação de escopo antes do deploy

O [painel do super admin](../38-plano-implantacao-super-admin.md) será desenvolvido em seis etapas SA-01 a SA-06, após a entrega técnica da Sprint 05 e antes do deploy/piloto da Sprint 06. As sprints existentes não serão renumeradas. SA-01 concluída como especificação; SA-02 a SA-06 aguardam implementação.


## SA-01 — especificação concluída em 23/09/2026

Consultar [regras e arquitetura do super admin](../39-super-admin-regras-e-arquitetura.md). Define a atualização antes do deploy; não representa recursos já implementados. Preserva os fluxos existentes e acrescenta isolamento de sessão, MFA e gestão de contas nas etapas SA-02 a SA-06.


## SA-02 implementada

[Execução e evidências](sa-02-execucao.md) — login separado, MFA, bootstrap e recuperação. Gestão de organizações e contas continua nas próximas etapas.

- [Execução SA-04 — contas e super admins](sa-04-execucao.md).

- [Execução SA-05 — indicadores e auditoria](sa-05-execucao.md).

- [Execução SA-06 — homologação e entrega](sa-06-execucao.md).

## Atualização da experiência do super admin

[Plano UX-SA-01 a UX-SA-06](../44-estudo-e-plano-ux-super-admin.md). Etapas implementadas localmente; não substituem as SA-01 a SA-06 funcionais. [Entrega, testes e limites da UX-SA-06](ux-sa-06-execucao.md).
