# Sprint 01 — Admin, organizações e configuração

Status: implementada e validada localmente, incluindo homologação HTTPS. Ver [registro de execução](sprint-01-execucao.md). Duração proposta: 2 semanas. Fase F1; backlog B1/B2. Responsáveis: backend, frontend, QA e produto.

## Objetivo e incremento

Permitir que um admin entre no sistema e prepare sua prova com checkpoints, mantendo isolamento entre organizações. Esta é a base para emitir os acessos de campo na próxima sprint.

## Entrada

Sprint 00 aceita e G0 registrado. Ambiente local reproduzível e stack definida. Referências: [perfis](../05-perfis-e-acessos.md), [modelo de dados](../08-modelo-de-dados.md), [regras](../04-regras-de-negocio.md) e [API](../09-contrato-api.md).

## Tarefas

- [x] S01-01 — Backend: migrations de organizações, usuários, memberships e sessões; seed sintético de duas organizações; constraints e escopo organizacional.
- [x] S01-02 — Backend: provisionamento seguro do admin, hash de senha, login, logout, expiração, recuperação de uso único e revogação. Sem senha fixa no repositório.
- [x] S01-03 — Full stack: autorização por recurso, proteção de sessão/CSRF e erros genéricos; frontend de login e recuperação.
- [x] S01-04 — Backend: eventos, modalidade única, janelas de captura e checkpoints; ordenação, tipos, distância e estado. Migrations e contratos atualizados.
- [x] S01-05 — Frontend: lista/edição de eventos, formulário de checkpoints e indicação de organização/evento ativo.
- [x] S01-06 — Backend: transições de estado, versão concorrente e horário de largada; bloquear início sem checkpoint e alterações estruturais proibidas. Revisitar transições com dados reais nas Sprints 02–04.
- [x] S01-07 — Backend: infraestrutura de auditoria transacional para configuração e identidade, sem senhas/tokens; consulta técnica para verificação.
- [x] S01-08 — Liderança: disponibilizar homologação com banco e segredos próprios, TLS e procedimento inicial de deploy.
- [x] S01-09 — QA: executar T01/T02 nas rotas existentes e T03 de configuração; conferir pool de conexões e FKs contra associação entre organizações.

## Critérios de aceite

1. RF-01/02: admin válido acessa; credencial inválida, logout e token de recuperação expirado não autorizam uso.
2. Admin da organização A não lê/altera a prova B mesmo conhecendo seus IDs ou reutilizando conexão.
3. RF-03/04: criar rascunho, cadastrar pontos e preparar/iniciar conforme regras; ordem duplicada e distância inválida são recusadas.
4. Tentativas proibidas não deixam mutações parciais; mudanças permitidas possuem autor, data e auditoria.
5. A jornada é demonstrável em homologação. Finalização com filas/passagens será aceita somente após integração na Sprint 04.

## Verificação e demonstração

Usar dois admins sintéticos. Admin A cria evento e pontos; admin B tenta acessá-los e é bloqueado. Demonstrar login/recuperação/logout, transições e histórico. Guardar resultado de T01–T03, migrations e versão implantada.

## Entregáveis e saída

Admin funcional, configuração da prova, isolamento testado, homologação e auditoria inicial. Não inclui teclado, captura ou credenciais de campo. Falha de isolamento bloqueia avanço dependente; não deixá-la para a Sprint 05.

Próxima: [Sprint 02](sprint-02-captura-manual.md). Aplicar a definição comum de pronto do [índice](README.md).
