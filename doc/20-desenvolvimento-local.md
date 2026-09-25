# Desenvolvimento local

## Stack implementada na Sprint 00

Node 22 (verificado com 22.19.0), npm 10.9.3, TypeScript 5.9.3, React 19.3.0, Vite 8.3.0, Fastify 5.12.5, driver pg e PostgreSQL 18.6. Dependências diretas são exatas e as transitivas estão no package-lock.json. Biome executa lint/formatação; testes usam node:test e tsx. Workspaces npm: apps/web, apps/api e packages/contracts.

A escolha de React/TypeScript/PostgreSQL concretiza a proposta técnica anterior. Fastify fornece a API modular; SQL versionado permite iniciar sem ORM. PWA/offline e domínio esportivo não estão implementados nesta sprint.

## Instalação

1. Instalar Node da linha 22, versão 22.19 ou posterior, npm 10 e Docker Desktop com engine Linux.
2. Abrir terminal na raiz do projeto.
3. Copiar .env.example para .env, se .env ainda não existir.
4. Substituir `replace_with_local_password` por uma senha local forte em POSTGRES_PASSWORD e nas duas URLs. Para senha com caracteres reservados, codificar o valor nas URLs. Uma senha hexadecimal aleatória evita esse problema.
5. Executar:

```powershell
npm.cmd ci
npm.cmd run db:up
npm.cmd run db:migrate
npm.cmd run dev
```

Não sobrescrever uma configuração existente sem conferir seus valores. No ambiente desta entrega, .env já foi gerado com senha aleatória e não versionada. O banco sobe somente em 127.0.0.1:55432. Bancos: cronocheckpoint e cronocheckpoint_test. O segundo é criado pelo script de inicialização no primeiro boot do volume.

## Uso e verificações

- Interface: [localhost:5173](http://127.0.0.1:5173).
- Liveness: [API ativa](http://127.0.0.1:3001/api/v1/health/live), 200 mesmo sem banco.
- Readiness: [banco acessível](http://127.0.0.1:3001/api/v1/health/ready), 200 quando SELECT 1 funciona ou 503 sem detalhes de conexão.
- Contratos são compilados antes de dev/build/test; após alterar contratos, reiniciar dev ou recompilar o workspace.
- `npm.cmd run check`: lint, tipos, testes unitários e build.
- `npm.cmd run test:integration`: PostgreSQL real, reexecução de migration, detecção de checksum alterado e rollback.
- `npm.cmd run format`: corrige formatação e regras seguras suportadas.
- `npm.cmd run db:stop`: para os containers do projeto preservando o volume.
- Ctrl+C no terminal de dev encerra web/API; banco precisa ser parado separadamente.

Vite encaminha /api para 127.0.0.1:3001, evitando configuração CORS ampla. Se mudar API_PORT, ajustar o destino em apps/web/vite.config.ts. Os servidores de desenvolvimento não são exposição de produção nem estão liberados para outros aparelhos da rede.

## Migrations

SQL em apps/api/migrations, nomes 001_nome.sql, 002_nome.sql e assim por diante. Nunca editar migration aplicada: acrescentar outra. Histórico registra nome/checksum/data; lock transacional serializa execução. Falha reverte toda a execução atual. O comando é explícito, não executado ao iniciar a API.

A migration 001 cria apenas o schema app. Organizações, identidade e autorização pertencem à Sprint 01. O usuário do Compose é administrativo e **somente local**; credenciais de runtime com menor privilégio e RLS serão implementadas antes de usar dados reais.

## Problemas comuns

- Docker indisponível: iniciar Docker Desktop/engine Linux e repetir db:up.
- Porta ocupada: não parar aplicações de terceiros; ajustar Compose/URLs, ou API_PORT/proxy conforme a porta em conflito.
- Senha alterada após criação do volume: variável de inicialização não troca a senha existente; usar a senha original ou procedimento administrativo de rotação. Não apagar volume como tentativa automática.
- Banco de teste ausente em volume antigo: criar explicitamente cronocheckpoint_test com ferramenta administrativa após conferir o alvo. O script init não roda novamente em volume existente.
- Readiness 503: conferir conexão, container e credenciais sem publicar .env.
- Git com “dubious ownership”: a pasta .git foi criada pelo usuário isolado do ambiente. O ajuste de proprietário foi bloqueado pela revisão automática e está pendente de autorização; não foram alteradas ACLs nem exceções globais.

## Validação desta entrega

Build e verificações passaram com as versões acima. Os endpoints responderam por HTTP. Instalação via npm ci em cópia limpa foi verificada conforme o registro de execução. Interface conferida no Edge desktop e viewport móvel; isso não substitui testes em Android/iOS reais previstos para as próximas sprints.

## Atualização Sprint 01

O admin, eventos, checkpoints, autenticação e auditoria agora estão implementados. O guia atualizado de instalação, runtime restrito e acesso por email está em [Admin e homologação](22-admin-e-homologacao.md); suas instruções substituem as limitações de fundação descritas acima. Após migrations, executar db:runtime e reiniciar a API. O schema 002 já está aplicado no ambiente entregue.
