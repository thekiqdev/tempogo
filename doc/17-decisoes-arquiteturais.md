# Registro de decisões arquiteturais

Status: propostas, exceto ADR-001, que deriva da instrução do solicitante. Alterar uma ADR exige registrar motivo, alternativa escolhida e documentos afetados.

## ADR-001 — Começar sem IA • confirmado

Contexto: PDF começa por câmera/OCR, mas o usuário prioriza estrutura e entrada manual. Decisão: MVP sem componentes de IA. Consequência: validar operação e domínio primeiro; interfaces de fonte preparadas para futura integração. Rejeitada para F1: implementação do MVP original das páginas 17/21.

## ADR-002 — Monólito modular • proposto

Motivo: equipe inicial e domínio ainda em validação. Uma API e um banco reduzem operação distribuída. Alternativa: microserviços desde o início; adiada até métricas mostrarem necessidade. Workers de IA podem ser separados posteriormente sem fragmentar o núcleo de negócio.

## ADR-003 — Organização desde o primeiro modelo • proposto

Motivo: SaaS multiempresa faz parte da visão final. Incluir tenant em autorização, entidades e constraints desde F1; não construir onboarding/cobrança antecipadamente. Alternativa: banco sem tenant e migração posterior, rejeitada pelo risco de vazamento/refatoração.

## ADR-004 — Web/PWA com fila local • proposto

Motivo: acesso rápido em celulares e tolerância à rede. Alternativas: online estrito (mais simples, frágil em campo) ou app nativo (mais custo inicial). Consequência: testar navegadores e tratar quota/cache/expiração; sem garantia de upload com tela fechada.

## ADR-005 — Observação imutável e revisão • proposto

Motivo: cronometragem precisa de procedência e possibilidade de correção. Alternativa: editar linhas diretamente; rejeitada por perder valor original. Projeções simplificam consulta. Não adotar event sourcing completo para toda a aplicação nesta fase.

## ADR-006 — Tempo de captura separado de recebimento • proposto

Motivo: upload pode atrasar; ordenação da rede não é ordem da corrida. Guardar relógio e qualidade temporal, sem prometer precisão que o operador não entrega. Alternativa: usar só relógio do servidor; rejeitada para captura offline.

## ADR-007 — Credencial restrita de checkpoint • proposto

Motivo: pedido de código/senha e velocidade de operação. Credencial não equivale a usuário admin; sessão fixa escopo. Alternativa: conta pessoal obrigatória para cada voluntário; possível depois, mantendo a separação de permissões.

## ADR-008 — PostgreSQL e TypeScript no núcleo • proposto

Motivo: transações, integridade relacional e compartilhamento de contratos. Alternativa: backend Python desde F1, válida se a equipe já tiver domínio; decisão final em D04. Python continua candidato natural ao worker de visão da fase futura, sem obrigação de reescrever API.

## ADR-009 — Polling inicial, mensageria quando necessária • proposto

Motivo: painel simples sem infraestrutura adicional. Adotar outbox/SSE e filas conforme resultados/integrações exigirem. Não adicionar Redis/Kubernetes apenas porque aparecem na apresentação.

## ADR-010 — Um percurso sem voltas no MVP • proposto

Motivo: separar validação da captura de regras esportivas mais complexas. Modelo identifica modalidade desde o início, mas múltiplas modalidades e circuitos só serão liberados após F2. Se o piloto exigir voltas, revisar escopo e estimativa antes de codificar.

## Concretização técnica da Sprint 00 — 16/09/2026

ADR-002 e ADR-008 adotadas na fundação: monólito modular em TypeScript, API Fastify, web React/Vite e PostgreSQL com SQL versionado, sem ORM neste incremento. Não implica aprovação de fornecedor, orçamento ou infraestrutura de produção. ADR-010 confirmada pelo usuário para o MVP. Demais decisões mantêm seu status anterior.


## SA-01 — especificação concluída em 23/09/2026

Consultar [regras e arquitetura do super admin](39-super-admin-regras-e-arquitetura.md). Define a atualização antes do deploy; não representa recursos já implementados. Preserva os fluxos existentes e acrescenta isolamento de sessão, MFA e gestão de contas nas etapas SA-02 a SA-06.
