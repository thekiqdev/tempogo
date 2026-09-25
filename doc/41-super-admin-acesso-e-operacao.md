# SA-02 — Acesso seguro à plataforma

Data: 23/09/2026. Implementado e validado localmente. Organizações e contas entregues nas SA-03/04; consultar manual 42.

## Abrir o painel

Desenvolvimento: http://127.0.0.1:5173/plataforma. A API só registra as rotas da plataforma quando PLATFORM_DATABASE_URL e PLATFORM_MFA_KEY estão configurados juntos; configuração parcial impede startup. Sem configuração, a tela informa que o acesso não está habilitado.

No ambiente local deste projeto, migrations 007/008 foram aplicadas e o runtime separado/chave foram configurados em .env, sem imprimir segredos. Nenhuma conta real de super admin foi criada. Os testes usam contas sintéticas em bancos temporários que são removidos ao terminar.

## Primeiro super admin

Com PostgreSQL e Mailpit ativos, executar da raiz:

~~~powershell
npm run db:migrate
npm run platform:local
npm run platform:admin -- bootstrap seu-email@exemplo.com
~~~

O segundo comando serve exclusivamente ao banco local cronocheckpoint em loopback. Preserva configuração existente e recusa rotação automática de role/chave. Reiniciar a API quando necessário para carregar .env. Bootstrap é um comando técnico com MIGRATION_DATABASE_URL; não existe endpoint público e não há senha padrão.

Abra o email no Mailpit local em http://127.0.0.1:8025, defina a senha pelo link de 30 minutos, entre em /plataforma e gere a chave do autenticador. Cadastre-a manualmente em um aplicativo compatível com TOTP (6 dígitos, período 30 segundos), confirme um código e guarde os dez códigos de recuperação exibidos uma única vez. A interface não gera QR nesta etapa.

O bootstrap fica registrado permanentemente. Segunda execução é recusada, mesmo se a conta perder privilégio. Se o email falhar depois da criação, use Esqueci minha senha no painel; não remova o marcador do bootstrap. Para identidade já existente, o comando preserva a senha até o titular definir outra pelo link e não cria vínculo de organização.

## Sessões e recuperação

Sessão da plataforma: até 8 horas, inatividade de 15 minutos, cookie próprio HttpOnly/SameSite Strict e Secure em HTTPS. MFA é obrigatório antes de emitir a sessão. Cookie de organizador ou de campo não autentica o painel global. O desafio inicial vale cinco minutos; tentativas são limitadas no banco. Código TOTP já aceito não pode ser repetido: aguarde o próximo código para confirmar identidade novamente.

A opção Confirmar identidade verifica senha e novo código e registra validade de cinco minutos para futuras ações sensíveis. Sair revoga a sessão no banco. Trocar senha ou bloquear identidade incrementa auth_version e invalida sessões/desafios globais inclusive quando a alteração ocorre pelo fluxo antigo de recuperação do organizador. MFA não é removido pela troca de senha.

Perda do aparelho: após informar email/senha, escolha Usar código de recuperação. O código é consumido e permite somente cadastrar um novo autenticador; não libera o painel diretamente. Códigos anteriores são substituídos após confirmar o novo fator. Se o desafio expirar, faça login e utilize outro código de recuperação ou siga o procedimento técnico abaixo. A recuperação pendente impede login completo com o fator antigo.

Sem códigos disponíveis, o responsável técnico verifica a identidade do titular por canal previamente estabelecido e registra o motivo. No terminal restrito:

~~~powershell
$env:PLATFORM_RECOVERY_CONFIRMED='true'
npm run platform:admin -- recover-mfa seu-email@exemplo.com 'Identidade conferida pelo procedimento interno'
Remove-Item Env:PLATFORM_RECOVERY_CONFIRMED
~~~

O comando revoga sessões, registra auditoria e envia autorização de uso único ao email já cadastrado. O titular ainda precisa informar a senha e cadastrar/validar novo MFA; o comando nunca retorna uma sessão. Se o email falhar, o responsável pode reemitir a autorização, invalidando a anterior. Não mudar email como parte dessa recuperação. A interface de recuperação por outro super admin foi entregue na SA-04.

## Implantação na Contabo/Easypanel

Aplicar migrations com a identidade de migration. Provisionar runtime independente usando node apps/api/dist/provision-platform-runtime.js, em job restrito com MIGRATION_DATABASE_URL, EXPECTED_DATABASE_NAME e PLATFORM_RUNTIME_PASSWORD aleatória de 32–128 caracteres alfanuméricos, hífen ou sublinhado. O comando recusa substituir uma role existente.

Configurar na API:
- PLATFORM_DATABASE_URL apontando para cronocheckpoint_platform_runtime.
- PLATFORM_MFA_KEY com 32 bytes aleatórios em hexadecimal (64 caracteres).
- PUBLIC_ORIGIN HTTPS e SMTP existentes.

O startup confere que o novo runtime não é superuser, não tem BYPASSRLS, pertence ao grupo da plataforma e não pertence ao grupo do organizador. A chave MFA é externa ao banco e nunca deve ir para Git, imagem, log ou ticket. Guardar cópia protegida separada, conforme procedimento de backup. Perder a chave impede ler fatores existentes. A versão de cifra atual é v1; não trocar a chave em produção sem migração de recifragem — rotação automatizada ainda não faz parte desta entrega.

Executar bootstrap pelo job técnico: node apps/api/dist/platform-cli.js bootstrap EMAIL. Retirar MIGRATION_DATABASE_URL e variáveis de provisionamento do serviço da API. TLS/SMTP reais, backup da chave e ensaio na VPS continuam responsabilidade da implantação. O compose de homologação anterior não recebe automaticamente credenciais da plataforma de desenvolvimento; configure runtime/chave próprios se habilitar esse painel nele.

## Contratos efetivamente entregues

Prefixo /api/v1/platform/auth: login, mfa/enroll, mfa/confirm, mfa/verify, mfa/recovery, me, reauthenticate, logout, password/forgot, password/reset e mfa/reset/accept. Implementação em platform.ts. Erros usam o envelope existente error com code/message/request_id/retryable; validação de entrada usa 422, preservando a convenção atual do projeto. Organizações, convites e gestão de contas foram acrescentados nas etapas SA-03/04; consultar os registros de execução para os contratos efetivos.

Migrations: 007_platform_identity cria tabelas, role e versão de autenticação; 008_platform_password_audit concede apenas append à auditoria global ao runtime organizacional para registrar recuperação de senha compartilhada na mesma transação. Não concede leitura de MFA ou histórico global. Não altera migrations anteriores. A função que incrementa auth_version é invoker, não SECURITY DEFINER.

Após SA-03/04, o runtime da plataforma possui leitura de eventos, checkpoints e passagens sujeita ao RLS, usada para contagens, e pode criar privilégios por convite. Não possui escrita de passagens nem permissão de bootstrap. Logs seguem o formato sanitizado existente. Notificação de mudança de fator tenta envio após commit; falha é registrada sem segredo. Reenvio persistente de notificações via outbox pertence à etapa de convites SA-03.

## Verificação reproduzível

~~~powershell
npm run check
npm run test:integration
npm run test:e2e:platform
~~~

O E2E usa frontend compilado, backend HTTP real, PostgreSQL real e Edge; cria e remove somente seu banco sintético com nome único. Executar build antes do E2E ao alterar frontend. Capturas em tmp/sa-02 mostram o painel após ocultar os códigos, sem chave MFA ou senha.

TOTP foi conferido contra os vetores SHA-1 do [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238), adaptando a saída para seis dígitos. O fluxo de recuperação mantém verificação adicional e recadastro antes do acesso, alinhado às orientações da [OWASP sobre MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html). Isso não substitui a homologação de implantação SA-06.
