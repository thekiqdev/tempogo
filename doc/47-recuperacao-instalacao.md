# Inicialização e recuperação com variáveis do Easypanel

Este fluxo substitui o comando temporário e o arquivo de credenciais do guia 46. Usa apenas Environment do Easypanel; não requer arquivo .env nem volume de credenciais.

## Configuração

Use infra/Dockerfile.api e remova qualquer comando de início personalizado. O comando padrão da imagem executa start-cli.js.

Mantenha NODE_ENV=production, API_HOST=0.0.0.0, API_PORT=3001, PUBLIC_ORIGIN com a origem HTTPS do frontend e DATABASE_URL com a conexão administrativa completa do banco já existente. Configure PLATFORM_MFA_KEY com a chave original de 64 caracteres hexadecimais e METRICS_TOKEN. Preserve SMTP real. Remova MIGRATION_DATABASE_URL antiga e PLATFORM_DATABASE_URL manual deste modo automático.

Adicione:

```env
SETUP_ON_START=true
# Somente para recuperar as senhas internas perdidas:
SETUP_RESET_RUNTIME_PASSWORDS=true
```

Faça Deploy da versão atual da main. O instalador aplica migrations e recupera as senhas dos dois usuários internos. Não exclui tabelas ou registros. As senhas anteriores deixam de autenticar novas conexões.

Após readiness responder 200, remova SETUP_RESET_RUNTIME_PASSWORDS e faça Deploy novamente. Mantenha SETUP_ON_START=true. Próximos inícios verificam migrations e reutilizam os acessos reproduzíveis a partir da configuração.

## Como funciona

As credenciais internas são derivadas com HMAC-SHA256, usando a chave configurada, identificação de domínio própria, nome do banco e role. Não são gravadas em arquivo nem impressas. Preserve a chave MFA entre deploys: ela também protege os segredos MFA existentes. Trocar a senha administrativa não altera as senhas derivadas; trocar a chave ou o nome do banco altera a derivação e exige manutenção planejada.

A conexão administrativa permanece na configuração do serviço para migrations no início. Antes de iniciar os handlers HTTP, o processo substitui as conexões por usuários limitados, mantendo a separação de permissões da aplicação. Quem tem acesso às variáveis do Easypanel possui credenciais administrativas: restrinja esse acesso. Para separar completamente a administração, continua disponível o fluxo manual de migrations e env com usuários limitados.

O flag de recuperação não recupera uma chave MFA perdida. Preserve a chave original se houver MFA cadastrado. O sistema não altera senhas existentes sem o flag explícito; uma divergência de credenciais bloqueia o início.

## Frontend e login

O frontend usa API_UPSTREAM com o DNS privado real do backend, porta 3001. O domínio público aponta para a porta 80 do frontend. Verifique /api/v1/health/ready pelo domínio público. SMTP de exemplo não envia email: configurar provedor real e criar o primeiro super admin continuam necessários para login.

## Verificação local realizada

Imagem Docker compilada. PostgreSQL temporário com 10 migrations e roles antigas; arquivo original descartado; recuperação explícita; readiness 200; container recriado sem volume e sem recuperação; readiness 200 novamente. Confirmado que o modo automático não criou tempogo-runtime.env. Nenhuma conexão com a VPS foi realizada.

## Primeiro superadmin sem SMTP

Após atualizar a imagem, configure temporariamente no Environment do backend:

```env
SUPERADMIN_EMAIL=seu-email@seu-dominio.com.br
SUPERADMIN_PASSWORD=ESCOLHA_UMA_SENHA_DE_12_A_128_CARACTERES
```

No terminal, na pasta `/app`, execute `npm run superadmin:create`. Usa MIGRATION_DATABASE_URL ou DATABASE_URL administrativa já configurada no modo automático. Não envia email, não registra a senha em logs e salva somente o hash. Depois remova as duas variáveis temporárias do Easypanel e faça Deploy para removê-las do processo.

Entre em `/plataforma` com o email e a senha escolhidos. Cadastre o autenticador MFA no primeiro acesso e guarde os códigos de recuperação. O email funciona como identificador de login; o comando não exige SMTP. As funções normais de convite e recuperação por email continuam dependendo de SMTP.

O comando só permite o primeiro superadmin. Recusa bootstrap anterior e email de conta já existente, sem sobrescrever senhas ou conceder privilégios a uma identidade existente.
