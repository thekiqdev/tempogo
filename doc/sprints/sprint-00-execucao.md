# Sprint 00 — Registro de execução

Data: 16/09/2026. Estado: **fundação técnica implementada e validada localmente; aceite G0 pendente**.

## Decisões registradas

- D01: usuário confirmou corrida de rua, modalidade única e sem voltas para o MVP.
- D02: usuário confirmou números de até oito dígitos, zeros preservados e captura sem cadastro prévio.
- D03: aplicação em corrida de rua confirmada; número de corredores, checkpoints, aparelhos e responsável pela operação não informados. 1.000/10/20 e 30 minutos offline continuam referência de ensaio, não escala aprovada de evento.
- D04 técnica: React/TypeScript, Vite, Fastify e PostgreSQL implementados como escolha de engenharia para a fundação autorizada. Equipe, responsáveis nominais, hospedagem e orçamento continuam abertos.
- Não usar IA nesta fase permanece confirmado. Nenhuma contratação, publicação ou acesso a dados reais foi realizado.

“Piloto” nos documentos significa a primeira corrida de rua em que o sistema será validado pela equipe de operação.

## Entregue

Monorepo npm com web/API/contratos, versões exatas e lockfile; Git local inicializado, sem commit/remoto; configuração local ignorada pelo Git; banco Docker restrito à máquina, bases de desenvolvimento/teste separadas; migration versionada com lock e checksum; liveness/readiness; pipeline CI declarada; guias e roteiro de jornada.

Página inicial responsiva informa estágio de desenvolvimento. Não há login, CRUD de evento ou registro de passagem nesta sprint.

## Evidências locais

- npm run check: lint, tipos, três testes unitários e builds dos três workspaces passaram.
- npm run db:up: PostgreSQL 18.6 iniciado e saudável.
- npm run db:migrate: 001_foundation.sql aplicada em banco inicialmente vazio.
- npm run test:integration: teste real passou, incluindo reexecução, rejeição de checksum alterado e rollback de DDL em falha.
- HTTP: interface 200; health/live 200/ok; health/ready 200/ready. Banco indisponível é coberto pelo teste unitário com 503 e sem detalhe sensível.
- Interface: Edge headless, desktop 1440×1000 e viewport móvel 390×844; sem erros JavaScript nem overflow horizontal. Capturas inspecionadas visualmente.
- npm ci e npm run check passaram em cópia limpa em tmp/sprint-00-clean, sem node_modules, dist ou .env preexistentes.
- .env, node_modules e dist confirmados como ignorados antes do bloqueio descrito abaixo.

## Pendências e limites

- S00-01 parcial: D03 ainda não fechada.
- S00-02 parcial: stack implementada; equipe, responsáveis nominais, provedor e orçamento a definir.
- S00-03 parcial: MVP manual mantido; primeira corrida/ensaio ainda sem data e responsável.
- S00-06 parcial: CI configurada e comandos locais validados; remoto não conectado, execução hospedada não verificada.
- Ajuste de proprietário da pasta .git para o usuário principal foi rejeitado pela revisão automática por alterar controle de acesso sem autorização específica. Nenhuma ACL foi alterada. Isso pode impedir comandos Git do usuário fora do ambiente isolado até resolução autorizada.
- Testes não demonstram segurança multi-tenant, login, operação de campo ou precisão esportiva; esses componentes ainda serão construídos.
- Gate G0 não é declarado concluído enquanto decisões operacionais/responsáveis e aceite da CI remota estiverem pendentes.

Próxima implementação prevista: Sprint 01. Fundação já pode ser usada para desenvolvimento local; o aceite administrativo da Sprint 00 segue registrado como pendente.
