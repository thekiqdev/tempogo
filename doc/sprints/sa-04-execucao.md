# SA-04 — Administração de contas e super admins

Data: 23/09/2026. Implementada e validada localmente.

Entregues pesquisa paginada de contas, vínculos, convite global de super admin, bloqueio global e por vínculo, transferência de responsável, revogação de sessões por alcance, redefinição de senha, recuperação de MFA e troca de email verificada. O último super admin elegível e o último admin de uma organização ativa são protegidos em transações concorrentes. Convite aceito cria privilégio invited: acesso só após MFA.

Migration aditiva 010_platform_accounts aplicada no desenvolvimento e testes; não altera migrations anteriores. Acrescenta versão da identidade, convites globais, propostas de email e fila cifrada de mensagens. A troca exige senha atual, token único, versão e email ainda disponível, revoga sessões e avisa o endereço antigo. Não há exclusão física de usuários.

## Contratos efetivos

Prefixo /api/v1/platform. GET users e users/:id; POST users/:id/status, sessions/revoke, password-reset e email-change. POST organizations/:id/members/:userId/status usa os parâmetros definidos em platform-accounts.ts. POST super-admins/:id/revoke e mfa-reset. Convites globais usam /super-admin-invitations, incluindo inspect, accept, :id/resend e :id/cancel, separados dos convites organizacionais. POST email-change/confirm é público e exige token/senha. Escritas administrativas exigem CSRF, Idempotency-Key e MFA recente; operações sensíveis exigem motivo.

Bloquear responsável exige substituição válida na mesma transação ou transferência prévia no painel. Recadastro MFA de outro super admin revoga sessões e mantém acesso indisponível até novo fator; recuperação do único admin segue CLI restrita do guia 41.

## Evidências

- npm run check: lint, tipos, 13 testes unitários e build aprovados.
- npm run test:integration: 69 testes aprovados; oito resultados SA-04 incluem convites/MFA, email, proteção do último admin, revogação e rollback quando auditoria falha.
- node --env-file=.env --import tsx tests/e2e/platform-accounts.mjs: Edge e PostgreSQL reais; organização, troca de email, convite global, cadastro MFA, desktop e viewport 360 px, sem erros JavaScript. Evidências tmp/sa-04/browser.json e capturas.
- Corrigida cifra de mensagem vazia autenticada, necessária ao aviso de troca de email; teste de adulteração tornou-se determinístico.

Mensagens são entregues por worker com retry; os ensaios usam adaptador sintético. SMTP real e deploy continuam pendentes do ambiente do usuário. Nenhuma conta real ou senha padrão criada.
