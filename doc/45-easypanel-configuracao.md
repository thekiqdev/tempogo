# Easypanel — configuração rápida

Repositório: https://github.com/thekiqdev/tempogo — branch `main`.

Crie dois serviços App e um PostgreSQL privado. Nos dois Apps, selecione fonte GitHub `thekiqdev/tempogo`, branch `main`, **Build Path `/`** e builder Dockerfile. O contexto deve ser a raiz porque os serviços compartilham o workspace `packages/contracts` e o lockfile.

## Backend (serviço api)

- Dockerfile: `infra/Dockerfile.api`.
- Porta interna: `3001`. Não associar domínio público, inclusive domínio automático.
- Environment: copiar `apps/api/.env.example`, substituir os placeholders e descomentar as duas variáveis PLATFORM para habilitar o super admin.
- `PUBLIC_ORIGIN`: domínio HTTPS do frontend, sem barra final ou caminho.
- Banco: usar runtime limitado, não a conta administrativa do PostgreSQL.
- Healthcheck incluído na imagem: `/api/v1/health/ready`.

## Frontend (serviço web)

- Dockerfile: `infra/Dockerfile.web`.
- Porta interna: `80`, protocolo HTTP. Configurar domínio público HTTPS no Easypanel.
- Environment: copiar `apps/web/.env.example` e ajustar `API_UPSTREAM` para o DNS privado real do backend, com porta 3001.
- Sem comando de build/start adicional: os Dockerfiles já fazem isso.
- Não usar o Dockerfile/Caddyfile de homologação, que emitem certificado local.

As variáveis são configuradas em Environment, sem gerar arquivo `.env` no build. Os exemplos não possuem credenciais reais. O arquivo `infra/production.env.example` permanece referência consolidada histórica; para os serviços, use os exemplos separados acima.

## Primeira instalação

Antes de iniciar a API, aplicar migrations e provisionar as roles com a imagem do backend em job temporário. Seguir o [guia de instalação e super admin](43-atualizacao-super-admin-deploy.md), incluindo `EXPECTED_DATABASE_NAME`, credenciais de migration, roles e bootstrap. Não existem usuários ou senhas padrão de produção. A API não executa migrations automaticamente.

Manter o PostgreSQL e seu volume persistentes. Após o bootstrap, retirar credenciais administrativas do job. Configurar SMTP e domínio reais para convites e recuperação de senha.

## Verificação

Abrir o domínio, recarregar `/checkpoint` e `/plataforma/pessoas`, conferir `/api/v1/health/ready` e login. A rota pública `/api/v1/operations/metrics` deve retornar 404. As configurações de domínio, SMTP e banco da VPS precisam ser verificadas após o deploy.

Builds locais a partir da raiz:

```sh
docker build -f infra/Dockerfile.api -t tempogo-api:deploy .
docker build -f infra/Dockerfile.web -t tempogo-web:deploy .
```

Referência dos campos: [documentação oficial de App Service](https://easypanel.io/docs/services/app).
