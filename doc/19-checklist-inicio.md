# Checklist para iniciar o desenvolvimento

## O que já existe

Apresentação analisada e documentação inicial neste diretório: produto, requisitos, domínio, permissões, interface, arquitetura, dados, API, sincronização, segurança, testes, operação, backlog, roadmap, IA, ADRs e riscos. A fundação web/API/banco foi implementada na Sprint 00; login e funcionalidades esportivas seguem pendentes. Ver o registro de execução em sprints/sprint-00-execucao.md.

## Primeira reunião de definição

- [ ] Nomear responsável por produto, liderança técnica e operação de prova.
- [ ] Resolver D01–D04 e registrar decisões.
- [ ] Confirmar piloto e alcance do MVP: manual, sem IA, sem voltas e sem ranking oficial como proposta inicial.
- [ ] Confirmar qual parte do cadastro de participantes entra no primeiro release.
- [ ] Escolher stack, ambientes e orçamento inicial.
- [ ] Revisar requisitos P0 e critérios de aceite.

## Primeiro incremento técnico

- [ ] Inicializar repositório e estrutura, convenções, lockfile e CI.
- [ ] Produzir guia de execução local com comandos realmente testados.
- [ ] Criar migrations e seed sintético com duas organizações para testar isolamento.
- [ ] Provisionar admin sem senha fixa no código.
- [ ] Implementar fatia vertical: login → evento → checkpoint → código/senha → captura → consulta admin.
- [ ] Validar commit/idempotência e escopo antes de ampliar interfaces.
- [ ] Completar fila, revisão, exportação e operação conforme backlog.

## Documentos que serão complementados com evidências

Não preencher ficticiamente resultados que dependem de implementação. Estes artefatos têm responsáveis e prazo:

- **OpenAPI executável:** backend, B4; validar em CI contra implementação do contrato inicial.
- **Migrations e dicionário físico:** backend, B1–B4; tipos, constraints, índices e reversibilidade real.
- **Protótipo de interface aprovado em campo:** frontend/operação, B5; revisão com dispositivo e operador reais.
- **Guia local, deploy e rollback com comandos:** liderança técnica, B0/B9; dependem da stack/provedor escolhidos.
- **Relatório de segurança e testes:** QA/liderança, B9; anexar evidências e limitações.
- **Relatório de backup/restore:** operação técnica, B9; medir RPO/RTO, sem declarar metas atingidas antes do ensaio.
- **Termos, avisos e política de retenção final:** produto/responsável por dados, antes do piloto; validar finalidade e contexto.
- **Relatório e aceite do piloto:** produto/operação, B10; contagens, perdas, atraso humano e feedback.
- **Modelo de custos/comercial:** produto, F2; cotações reais e suporte.
- **Protocolo de captura, dataset card e model card:** especialista de IA, F3; origem, licenças, divisões, métricas e limitações.
- **Relatório de benchmark e runbook de câmera/edge:** IA/operação, F3–F5.
- **Contratos de integração, publicação de resultados e suporte comercial:** backend/produto, F6.

## Ordem prática

Começar pelo [backlog](14-backlog-mvp.md) após fechar as decisões de G0. Usar [requisitos](03-requisitos-e-aceite.md) como aceite e [testes](12-qualidade-e-testes.md) como evidência. O [roadmap](15-roadmap.md) determina quando adicionar capacidades; o [plano de IA](16-evolucao-ia.md) evita acoplar o MVP a modelos ainda não validados.
