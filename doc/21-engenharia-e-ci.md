# Convenções de engenharia e CI

## Organização

- apps/web: React, interface responsiva e proxy de desenvolvimento.
- apps/api: Fastify, configuração, saúde e execução de migrations.
- packages/contracts: tipos públicos compartilhados; não exportar segredos ou detalhes internos do banco.
- infra: Compose e inicialização local do PostgreSQL.
- tests/unit: comportamento de saúde/configuração.
- tests/integration: banco PostgreSQL real separado.
- doc: especificações e evidências.

O pacote de domínio será criado quando surgirem regras reais na Sprint 01; não há módulos vazios nem dependências de IA.

## Convenções

TypeScript estrito, módulos ESM, arquivos em UTF-8. No backend, importações relativas terminam em .js para compatibilidade do build. Usar contratos compartilhados para respostas públicas e validação de entrada no limite HTTP ao implementar cada funcionalidade.

Erro HTTP: envelope com code, message, request_id e retryable. Não retornar erro bruto de driver nem credenciais. Logs de requisição ocultam cabeçalhos de autorização/cookie; novos campos sensíveis precisam entrar na política de redaction. Nenhum endpoint esportivo foi exposto ainda.

Configuração inválida falha ao iniciar. Health/live mede processo; health/ready mede acesso ao banco. Readiness não comprova permissão esportiva nem integridade de dados. Schema, autenticação, isolamento e auditoria funcional entram nas próximas sprints.

## CI configurada

Arquivo .github/workflows/ci.yml: push/PR → npm ci → npm run check → teste de integração com serviço PostgreSQL 18.6. Permissão do workflow: leitura do repositório. Credencial do serviço de teste é efêmera e não deve ser usada em ambiente persistente.

Não há remoto configurado nesta entrega; o workflow está pronto, mas execução hospedada ainda não ocorreu. Os mesmos comandos foram executados localmente. Para concluir o aceite remoto, configurar o provedor Git e verificar uma execução verde e uma falha controlada em branch de teste. Não criar falhas intencionais na branch principal.

## Homologação proposta

Frontend compilado em hospedagem estática, API em container/serviço Node e PostgreSQL separado. TLS e roteamento de /api na mesma origem. Segredos por ambiente e acesso restrito. O provedor, domínio e orçamento permanecem pendentes; não foi publicado serviço externo.

Build: npm run build. API compilada: apps/api/dist/server.js. Em ambiente com variáveis injetadas: npm run start -w @tempogo/api. Web: apps/web/dist. Executar migration como etapa separada de deploy usando o comando documentado e configuração do ambiente, com fonte/SQL disponíveis.

Antes de homologar Sprint 01: usuário de banco de aplicação separado de migration/admin, políticas de acesso, backup e TLS. Vite dev/preview não é servidor de produção.

## Revisão e entrega

Cada alteração deve atualizar contrato/documentação afetados, ter testes proporcionais ao risco e não incluir .env, node_modules ou dist. Mudanças de schema exigem migration nova e verificação de reexecução/rollback. Versões fixadas não dispensam manutenção futura: revisar atualizações em mudança própria com CI.

Referências consultadas na implementação: [Vite](https://vite.dev/guide/) e [Fastify](https://fastify.dev/docs/latest/Reference/Server/).

## Atualização Sprint 01

Identidade e configuração foram implementadas com validação Zod, sessão opaca, proteção de origem/CSRF e RLS. Homologação local containerizada com TLS está disponível conforme [guia](22-admin-e-homologacao.md). Provedor externo e CI hospedada continuam pendentes.
