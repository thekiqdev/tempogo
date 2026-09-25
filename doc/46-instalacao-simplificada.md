# Instalação simplificada no Easypanel

Este fluxo usa o PostgreSQL já criado. Não é necessário criar usuários manualmente. `npm run setup` testa a conexão, aplica todas as migrations, cria os acessos limitados da API e plataforma, gera chave MFA/token e verifica as duas conexões finais. Não cria contas de acesso ao aplicativo; convites e super admin ainda dependem de SMTP real.

## Primeira instalação

Atualize o backend com a branch main. Para esta preparação, mantenha apenas estas variáveis de conexão (além de SMTP real, se já configurado):

```env
NODE_ENV=production
API_HOST=0.0.0.0
API_PORT=3001
PUBLIC_ORIGIN=https://tempogo-tempogo-frontend.xsfcqo.easypanel.host
DATABASE_URL=COLE_A_URL_DE_CONEXAO_INTERNA_COMPLETA_DO_POSTGRESQL
```

Remova valores antigos de exemplo de `MIGRATION_DATABASE_URL`, `PLATFORM_DATABASE_URL`, `PLATFORM_MFA_KEY` e `METRICS_TOKEN`. Neste passo, DATABASE_URL usa a conta administrativa que o PostgreSQL já fornece.

Se a API está reiniciando e não permite abrir o terminal, use temporariamente o comando de início personalizado:

```sh
sh -c "npm run setup && env -u DATABASE_URL node --env-file=apps/api/tempogo-runtime.env apps/api/dist/server.js"
```

Faça Deploy. O instalador prepara o banco e inicia a API usando os acessos limitados gerados. Copie o resultado antes de recriar o container para preservar as credenciais. Se o terminal já está disponível, basta executar `npm run setup` em `/app`, sem alterar o comando de início.

No terminal do backend, visualize o arquivo:

```sh
cat /app/apps/api/tempogo-runtime.env
```

Copie as variáveis geradas para Environment do backend, substituindo as correspondentes. Guarde uma cópia segura antes de recriar o container, pois o arquivo local é efêmero e contém senhas. Preserve as variáveis SMTP reais. Remova a conexão administrativa de migration, se existir. Remova o comando de início personalizado para voltar ao comando padrão da imagem e faça Deploy novamente.

## Frontend

Configure apenas a variável de conexão:

```env
API_UPSTREAM=tempogo_tempogo-backend:3001
```

Esse DNS corresponde ao padrão dos nomes informados (projeto tempogo, serviço tempogo-backend). Confirme o endereço interno real do serviço no Easypanel. Frontend: porta 80; backend: porta 3001; ambos na mesma rede de projeto. O navegador usa /api/v1 no próprio domínio.

Abra `/api/v1/health/ready` pelo domínio do frontend para verificar a conexão completa. SMTP e criação do primeiro super admin seguem o guia 43 após esta conexão estar funcionando.

## Repetição e recuperação

O setup preserva o arquivo gerado e as senhas; não troca credenciais de roles existentes. Se falhar, corrija a causa e repita no mesmo container, com o arquivo intacto. Se as roles já existem e o arquivo foi perdido, restaure-o do backup seguro ou use as credenciais previamente provisionadas; o instalador recusa redefini-las automaticamente. Para atualizações normais de esquema, use `npm run migrate` com credencial administrativa em job temporário.

O arquivo tempogo-runtime.env não entra no Git ou no contexto Docker. O script não imprime credenciais nos logs. Não gere outra chave MFA depois de cadastrar usuários.

## Inicialização automática pelo Environment do Easypanel

Para usar somente as variáveis do Easypanel, sem arquivo de credenciais nem volume, prefira o [fluxo atualizado de inicialização e recuperação](47-recuperacao-instalacao.md). Ele substitui o comando temporário descrito acima pelo comando padrão da imagem.
