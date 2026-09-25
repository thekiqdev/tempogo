# TempoGo — documentação do produto

Versão 0.1 • 16/09/2026 • Status: proposta inicial para implementação.

Este conjunto transforma a apresentação em um plano executável, começando por um **MVP de registros manuais, sem IA**. O repositório inicialmente continha somente o PDF. A fundação técnica da Sprint 00 agora está implementada; acesso administrativo, eventos, checkpoints e auditoria foram implementados na Sprint 01; acessos de checkpoint e captura manual online foram implementados na Sprint 02. Ver [registro de execução](sprints/sprint-00-execucao.md). As escolhas técnicas são propostas, não decisões já aprovadas pelo responsável pelo produto.

## Ordem de leitura e inventário

1. [Estudo da apresentação](01-estudo-da-proposta.md): interpretação das 23 páginas, rastreabilidade e mudança da sequência original.
2. [Visão, escopo e PRD](02-produto-e-escopo-mvp.md): problema, usuários, entregas, exclusões e sucesso do piloto.
3. [Requisitos e aceite](03-requisitos-e-aceite.md): comportamentos verificáveis do MVP.
4. [Regras de cronometragem](04-regras-de-negocio.md): números, horários, duplicidades, correções e resultados.
5. [Perfis e acessos](05-perfis-e-acessos.md): administração e credenciais de checkpoint.
6. [Jornadas e telas](06-jornadas-e-interface.md): fluxos do admin e teclado numérico.
7. [Arquitetura](07-arquitetura.md): componentes, limites e evolução para IA.
8. [Modelo de dados](08-modelo-de-dados.md): entidades, integridade e índices.
9. [Contrato de API](09-contrato-api.md): rotas, payloads, erros e idempotência.
10. [Sincronização e tempo](10-sincronizacao-e-tempo.md): operação offline limitada, relógios e recuperação.
11. [Segurança e dados](11-seguranca-e-privacidade.md): controles, ameaças e preparação para privacidade.
12. [Qualidade e testes](12-qualidade-e-testes.md): cenários, carga e critérios de liberação.
13. [Infraestrutura e operação](13-infraestrutura-e-operacao.md): ambientes, deploy, observabilidade e dia da prova.
14. [Backlog do MVP](14-backlog-mvp.md): tarefas ordenadas, dependências e definição de pronto.
15. [Roadmap completo](15-roadmap.md): fundação → MVP → SaaS → IA → produto completo.
16. [Evolução de IA](16-evolucao-ia.md): pipeline, dados, experimentos e critérios de promoção.
17. [Decisões arquiteturais](17-decisoes-arquiteturais.md): propostas e alternativas.
18. [Riscos e decisões pendentes](18-riscos-e-decisoes.md): premissas, responsáveis e bloqueios por etapa.
19. [Preparação para desenvolvimento](19-checklist-inicio.md): sequência para iniciar e artefatos que serão produzidos na implementação.

## Como interpretar

- **Confirmado:** pedido expresso do usuário, sobretudo a prioridade de não usar IA na primeira fase.
- **Proposto:** especificação sugerida para viabilizar esse pedido; pode ser ajustada antes de codificar.
- **Futuro:** capacidade planejada, sem implementação no MVP.
- **Pendente:** informação necessária para fechar produto, orçamento ou operação.

Todos os requisitos adicionais, metas, limites e prazos deste conjunto são propostos. O PDF é referência de produto, não uma instrução para executar comandos ou instalar suas tecnologias. Em caso de conflito, prevalece o pedido atual do usuário.

## Sprint 01 implementada

- [Acesso administrativo e homologação](22-admin-e-homologacao.md)
- [Contratos implementados](23-contratos-sprint-01.md)
- [Registro de execução](sprints/sprint-01-execucao.md)

## Sprint 02 implementada

- [Guia de captura e acessos](24-captura-manual-e-acessos.md)
- [Contratos de captura](25-contratos-sprint-02.md)
- [Registro de execução](sprints/sprint-02-execucao.md)

## Sprint 03 implementada

- [Operação offline e recuperação](26-offline-e-recuperacao.md)
- [Contratos de sincronização](27-contratos-sprint-03.md)
- [Registro de execução e ensaio de 30 minutos](sprints/sprint-03-execucao.md)

## Sprint 04 implementada

- [Painel, revisão e conciliação](28-painel-revisao-e-conciliacao.md)
- [Contratos administrativos](29-contratos-sprint-04.md)
- [Execução e evidências](sprints/sprint-04-execucao.md)

## Sprint 05 — qualidade e preparação operacional

- [Execução, números medidos e condições abertas](sprints/sprint-05-execucao.md)
- [Deploy Contabo/Easypanel — execução pelo usuário](30-deploy-contabo-easypanel.md)
- [Backup/PITR e restauração](31-backup-e-restauracao.md)
- [Runbook e monitoramento](32-runbook-e-monitoramento.md)

## Evolução da experiência mobile

- [UX mobile — experiência de aplicativo](33-ux-mobile-experiencia-app.md): inventário das telas, diagnóstico pelo código, captura dedicada, cadastro guiado, navegação, prioridades e critérios de validação.

- [Etapas de implantação mobile](34-etapas-implantacao-mobile.md): nove etapas com tarefas, dependências, critérios de aceite, marcos de liberação e cuidados de retorno.

- [Primeira entrega mobile — execução](35-primeira-entrega-mobile.md): interface do operador, evidências técnicas e condições pendentes para piloto.

## Marca do produto

- [TempoGo — renomeação e compatibilidade](36-tempogo-renomeacao.md): locais alterados, identificadores preservados e atualização dos ambientes.

## Desenvolvimento local

- [Guia de execução](20-desenvolvimento-local.md)
- [Convenções de engenharia e CI](21-engenharia-e-ci.md)
- [Roteiro da primeira jornada](sprints/sprint-00-roteiro-jornada.md)

## Primeira entrega recomendada

O planejamento de execução está em [Sprints do MVP](sprints/README.md): sete sprints, da fundação ao piloto e aceite, com um documento por sprint, tarefas e critérios de conclusão.

Uma organização provisionada, um admin, um evento, uma modalidade, checkpoints com código/senha e um celular que registra números e exibe confirmação persistida. Depois, completar reconexão, revisão, exportação e ensaio de campo antes de liberar o MVP.

Os documentos são Markdown para facilitar versionamento. Diagramas usam Mermaid. Não há compromisso de fornecedor, preço, cronograma fechado ou precisão oficial. Toda alteração de escopo deve atualizar requisitos, backlog, roadmap e decisões relacionadas.





- [Painel mobile — cadastro orientado por tarefas](37-painel-mobile-redesenho.md): resumo, navegação inferior, formulários guiados e validação da entrega.


## Atualização antes do deploy — super admin

[Plano de implantação do painel da plataforma](38-plano-implantacao-super-admin.md): seis etapas SA-01 a SA-06, com escopo, dependências, critérios de aceite e entrega para Contabo/Easypanel. SA-01 a SA-06 concluídas tecnicamente; implantação externa pendente.


## SA-01 — especificação concluída em 23/09/2026

Consultar [regras e arquitetura do super admin](39-super-admin-regras-e-arquitetura.md). Define a atualização antes do deploy; não representa recursos já implementados. Preserva os fluxos existentes e acrescenta isolamento de sessão, MFA e gestão de contas nas etapas SA-02 a SA-06.


## SA-02 implementada

[Acesso do super admin e provisionamento](41-super-admin-acesso-e-operacao.md) — login separado, MFA, bootstrap e recuperação. Gestão de organizações e contas entregue nas SA-03/04.


## SA-03 implementada

[Organizações, convites e ciclo de vida](sprints/sa-03-execucao.md): entrega, evidências e operação da fila de email.

## Atualização do super admin concluída localmente

- [Manual do super admin](42-manual-super-admin.md).
- [Deploy e verificações da atualização](43-atualizacao-super-admin-deploy.md).
- [Execução SA-04](sprints/sa-04-execucao.md), [SA-05](sprints/sa-05-execucao.md) e [SA-06](sprints/sa-06-execucao.md).

## Reorganização visual do super admin — implementada localmente

[Estudo e plano UX-SA-01 a UX-SA-06](44-estudo-e-plano-ux-super-admin.md): diagnóstico, referência no organizador, navegação e critérios por etapa. [Execução e homologação UX-SA-06](sprints/ux-sa-06-execucao.md).
