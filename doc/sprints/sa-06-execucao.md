# SA-06 — Homologação e entrega técnica

Data: 24/09/2026. Concluída tecnicamente no ambiente local; aceite da implantação na VPS pendente do usuário.

## Verificações concluídas

- Lint, tipos, build e 13 testes unitários aprovados; 71 testes de integração aprovados. Abrangem autorização, CSRF, MFA/replay/recuperação, sessão revogada, isolamento RLS, concorrência, versão, convites, email, ciclos e auditoria.
- Instalação vazia em bancos sintéticos e atualização de base de teste com migrations 001–006. Aplicação de 007–010 preservou vínculos, eventos, categorias, checkpoints, credenciais, sessões e passagens. Segunda aplicação foi idempotente.
- Dump lógico e restauração em outro banco preservaram os dados. MFA restaurado funciona com a chave externa correta e recusa chave diferente. Ensaio não substitui PITR/backup externo da VPS.
- Edge real, dois super admins e duas organizações, SMTP via Mailpit, aceite, troca de email, MFA, pesquisa/auditoria e viewport móvel passaram sem erros JavaScript.
- Captura de 100 passagens offline, reconexão com UUIDs/payloads preservados, suspensão da organização com outra passagem pendente, nenhum upload revogado, exportação, reativação e recuperação idempotente para revisão passaram. Interrupção de segundos; ensaio de 30 minutos não foi repetido nesta atualização.
- Regressão HTTPS em Docker: organizador, evento, checkpoint, captura/sincronização, revisão com resposta perdida e retry, filtros, CSV, conciliação, finalização, reabertura e histórico aprovados. A primeira execução da jornada de revisão teve timeout de navegação no histórico; repetição isolada passou. Não foi identificada falha persistente da aplicação.
- Imagens de homologação reconstruídas e saudáveis; builds dos Dockerfiles de produção aprovados. Os builds não obtiveram metadata Git; identificação da candidata usa SHA-256 dos arquivos e IDs locais das imagens, sem alterar safe.directory.
- Manutenção ensaiada: readiness indisponível durante parada, API retorna com candidata atual e passagens inalteradas. Retorno para código legado bloqueado no script antigo.

## Evidências e entrega

[Resumo estruturado](../releases/super-admin-evidence.json), [manifesto](../releases/super-admin-candidate.json) e [guia de deploy](../43-atualizacao-super-admin-deploy.md). Artefatos locais detalhados: tmp/sa-06, tmp/sa-02 e regressões em tmp/sprint-03/homolog e tmp/sprint-04/homolog. O resumo não inclui tokens, senhas, chaves nem pacotes de recuperação.

Publicação e conferência real seguem o checklist do guia 43. Nenhum deploy externo, cadastro real ou IA nesta etapa. Responsáveis operacionais e aparelhos reais permanecem pendências de liberação.
