# Configurações da plataforma

O superadmin acessa **Configurações** no menu lateral (`/plataforma/configuracoes`).

## Logo

Envio de PNG ou JPEG de até 256 KB, com prévia e opção de restaurar TempoGo. A imagem fica no PostgreSQL, preservada entre deploys, e aparece no login e na marca do painel do superadmin. A rota pública de branding retorna somente a imagem; as configurações e sua edição exigem sessão de superadmin. A gravação exige CSRF e a origem configurada.

## Authenticator

O controle **Exigir Authenticator dos superadmins** define a política global. Desligado, o login usa email e senha, inclusive para contas que já cadastraram MFA. A confirmação de identidade para operações globais usa apenas a senha. As chaves cadastradas não são apagadas.

Ligado, o login exige o código ou o cadastro do Authenticator, inclusive para contas que começaram a usar a plataforma enquanto a exigência estava desligada. Sessões iniciadas somente com senha deixam de ser aceitas. Contas bloqueadas, privilégios revogados e recuperações pendentes continuam bloqueados.

A migração preserva a exigência atual como ligada. Para tornar o código dispensável, desmarque o controle e salve. Alterações concorrentes são detectadas por versão e todas as gravações entram na auditoria, sem copiar a imagem.

## Implantação

Aplicar `012_platform_settings.sql` via `npm run migrate` antes de iniciar a nova API. No desenvolvimento, utilizar `npm run db:migrate`. Nenhuma nova variável de ambiente é necessária. A PLATFORM_MFA_KEY continua necessária e deve ser preservada para permitir reativar o MFA com as chaves existentes.

Validação: testes de integração de configurações, regressão de autenticação e teste de navegador `npm run test:e2e:organizations`, cobrindo upload, remoção do logo, layouts desktop/mobile, login e confirmação por senha e reativação do MFA.
