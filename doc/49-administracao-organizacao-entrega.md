# Administração por organização — entrega local

Implementação local em 25/09/2026, baseada no plano 48. Nenhum commit ou push nesta entrega.

## Disponível

- Pessoas removido do menu principal; atalhos antigos orientam a escolher uma organização. Super admins continua separado.
- Ao abrir uma organização, a primeira área é Usuários e acessos. Cadastro, convites opcionais e histórico permanecem na ficha.
- Criar conta com senha temporária ou vincular conta existente, preservando a senha da conta existente.
- O primeiro usuário adicionado vira responsável; é possível transferir responsabilidade para outro usuário ativo.
- Ativar diretamente uma organização pendente com responsável ativo, sem convite/email. A ativação invalida convites iniciais substituídos.
- Redefinir senha na ficha, com aviso de alcance para todas as organizações da conta, revogação das sessões e troca obrigatória no próximo login.
- Bloquear/liberar vínculo, encerrar sessões da organização e desbloquear uma conta globalmente (alcance indicado). Contas de superadmin remetem à área própria para senha e privilégios.
- Alteração de email na ficha reaproveita o fluxo existente com confirmação por email; esse recurso ainda depende de SMTP. Criação, ativação e reset de senha não dependem.
- Busca/paginação de usuários no servidor. Ajustes para 360/390 px e formulários com confirmação de descarte.

## Banco e autenticação

Migration 011_admin_password_change.sql adiciona must_change_password com padrão false; usuários existentes não são obrigados a trocar senha por causa da migração. Cadastros e resets administrativos novos recebem true.

O login com senha temporária não emite sessão. A pessoa confirma a credencial temporária e escolhe outra senha no endpoint /auth/password/change-initial; só depois faz login normal. A autenticação também bloqueia sessões de identidades com troca pendente. Senhas usam scrypt; não são persistidas em respostas, auditoria ou comandos idempotentes. O fingerprint dos novos comandos usa HMAC para não criar um hash rápido público da senha.

A nova migration foi aplicada somente na homologação local pelo bootstrap normal. Um deploy futuro precisa levar backend, frontend e migration juntos.

## Sessão do superadmin

Após autorização explícita em 26/09/2026, operações vinculadas a uma organização dispensam a reconfirmação de senha/MFA a cada cinco minutos. Cadastro, ativação, convites, vínculos, responsável, redefinição de senha e encerramento de sessões da organização continuam exigindo sessão válida de superadmin, CSRF, versionamento e auditoria.

Operações globais (incluindo desbloquear a conta em todas as organizações, alterar email global e administrar superadmins) preservam a confirmação adicional no menu da conta.

### Validação desta alteração em 26/09

npm run check aprovado: lint, TypeScript, 13 testes unitários e build. Testes de integração e navegador atualizados para sessão sem reconfirmação; adicionadas verificações de CSRF, sessão revogada e confirmação global preservada.

A execução de integração encontrou ECONNREFUSED em 127.0.0.1:55432. Docker Desktop falhou ao iniciar o serviço dockerInference. Portanto os testes com banco/navegador desta alteração e a atualização dos containers locais permanecem pendentes. Os resultados abaixo referem-se à entrega anterior, antes da dispensa de reconfirmação.

## Validação

- npm run check: lint, TypeScript, 13 testes unitários e build aprovados.
- npm run test:integration: 73 testes aprovados com PostgreSQL real de teste.
- tests/e2e/organization-admin.mjs: jornada real de criação, usuário, ativação, reset, troca obrigatória e login; sem SMTP; 1280, 390 e 360 px sem rolagem horizontal.
- Capturas locais em tmp/organization-admin. Revisão visual realizada no celular simulado.
- Teste de integração novo: idempotência, senha não exposta, ausência de email, sessão revogada, recusa de conta de outra organização, vínculo de conta existente e administracao sem reconfirmacao recente; sessao revogada continua recusada.

## Como conferir

Abrir https://localhost:5443/plataforma, entrar como superadmin e abrir Organizações. Criar uma organização sem preencher a seção opcional de convite, adicionar usuário com senha, confirmar a ativação e fazer login do organizador em janela separada. A senha temporária será trocada antes de abrir Eventos.

Para recriar a homologação local: npm run homolog:up. Para executar a jornada nova isoladamente: node --env-file=.env --import tsx tests/e2e/organization-admin.mjs.

Regressão adicional concluída: tests/e2e/platform-release.mjs aprovado com PostgreSQL/navegador reais, convites e alteração de email via SMTP local, suspensão/reativação, dois superadmins, 100 registros offline preservados, larguras 360–1440 px e zoom de 200%.

## Verificacao posterior em 26/09

Docker voltou a responder. O banco de desenvolvimento estava parado; npm run db:up iniciou PostgreSQL e Mailpit. npm run db:migrate aplicou migration 011 no desenvolvimento. API na porta 3001 e proxy Vite na porta 5173 responderam ready. Os 73 testes de integracao e a jornada test:e2e:organizations passaram, incluindo administracao sem reconfirmacao. A pendencia de testes acima foi resolvida; containers de homologacao nao foram reconstruidos nesta verificacao.
