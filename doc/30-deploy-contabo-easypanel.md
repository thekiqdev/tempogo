# Deploy — Contabo VPS com Easypanel

Decisão do usuário em 22/09/2026: aplicação web, hospedada em VPS Contabo com Easypanel. O usuário informou que executará pessoalmente o deploy; não é necessário fornecer acesso ao agente. Não há aplicativo nativo nesta entrega. A preparação foi validada localmente; nenhum servidor externo foi acessado ou publicado.

## Topologia preparada

Um serviço PostgreSQL 18.6, um serviço App para a API e outro para o frontend. Somente o frontend recebe domínio público HTTPS. API, banco e métricas ficam na rede privada. Começar com uma réplica da API: o limitador HTTP e as métricas são locais ao processo; múltiplas réplicas exigem um armazenamento compartilhado do limitador e outro ensaio.

- API: contexto de build na raiz; Dockerfile **infra/Dockerfile.api**; porta interna 3001; processo como usuário node.
- Web: mesmo contexto; Dockerfile **infra/Dockerfile.web**; porta interna 80; API_UPSTREAM deve apontar para o DNS privado real da API.
- PostgreSQL: fixar postgres:18.6-bookworm e persistir /var/lib/postgresql, conforme layout dessa versão. Não publicar 5432.
- Domínio do web: HTTPS e redirecionamento HTTP → HTTPS no Easypanel. PUBLIC_ORIGIN da API deve ser exatamente a origem pública, sem caminho.
- Não usar o Caddyfile de homologação (TLS local) em produção. A imagem web de produção usa Caddyfile.production, com TLS terminado pelo Easypanel.

O Easypanel oferece build por Dockerfile, domínios/proxy e variáveis por serviço. Conferir os nomes e portas exibidos na instalação. [Documentação oficial do App Service](https://easypanel.io/docs/services/app).

## Informações que ainda faltam

Domínio/DNS, endereço e acesso ao Easypanel, vCPU/RAM/disco da VPS, região, email SMTP, armazenamento externo de backup e responsável técnico. Não foi contratado nem alterado plano Contabo. Não extrapolar os números medidos no computador local para a VPS.

A versão candidata e os hashes ficam em [manifesto da candidata](releases/super-admin-candidate.json). Usar tags imutáveis/digests e registrar a imagem anterior antes de atualizar. Não publicar com tag móvel sem registro do digest efetivamente instalado.

## Preparação do banco e primeira implantação

1. Criar projeto e banco privado no Easypanel. Anotar a URL interna como segredo; conferir backup e volume persistente.
2. Criar um serviço/job temporário com a imagem da API e acesso de migration ao banco. As variáveis privilegiadas não entram no serviço permanente.
3. Configurar MIGRATION_DATABASE_URL somente nesse job e executar:

```sh
node apps/api/dist/migrate-cli.js
```

4. Para criar o runtime pela primeira vez, configurar também EXPECTED_DATABASE_NAME e RUNTIME_PASSWORD aleatória de 32–128 caracteres A–Z/a–z/0–9/_/-. Executar:

```sh
node apps/api/dist/provision-runtime.js
```

O comando recusa banco diferente do esperado e role já existente. Não usa o bootstrap de homologação nem cria contas de demonstração. Para uma role existente, preservar sua credencial e planejar rotação separadamente.

5. Criar serviço permanente da API com DATABASE_URL do runtime limitado, PUBLIC_ORIGIN, SMTP e METRICS_TOKEN forte. Exemplo sem segredos: [production.env.example](../infra/production.env.example). Não configurar MIGRATION_DATABASE_URL ou RUNTIME_PASSWORD no serviço permanente. A API recusa conexão com SUPERUSER/BYPASSRLS ou usuário sem membership no grupo da aplicação.
6. Criar serviço web e configurar API_UPSTREAM com o DNS interno da API. Associar somente esse serviço ao domínio.
7. No job administrativo, provisionar o administrador real, usando email/organização confirmados:

```sh
node apps/api/dist/admin-cli.js EMAIL_CONFIRMADO NOME_DA_ORGANIZACAO
```

O link de definição de senha segue pelo SMTP. Não executar esse passo com endereços de terceiros sem autorização. Desabilitar o job depois e retirar seus segredos.
8. Verificar /api/v1/health/live, /api/v1/health/ready, login, recuperação de senha, criação de evento sintético, captura, revisão e exportação. Verificar que /api/v1/operations/metrics responde 404 pelo domínio público.

## Segurança operacional

Restringir SSH e acesso ao painel aos responsáveis, usar chave SSH e MFA nos serviços administrativos onde disponível; confirmar configuração na instalação real. Não habilitar acesso público ao banco ou ferramentas de administração permanentes. Isolar projetos/segredos de homologação e produção. Manter backup e credenciais de recuperação fora da VPS.

A documentação do serviço PostgreSQL descreve persistência e backups programados. Esses recursos, por si só, não demonstram recuperação contínua de até cinco minutos. [Postgres Service](https://easypanel.io/docs/services/postgres).

## Atualizar e voltar

Antes de atualizar: confirmar backup restaurável, estado dos aparelhos, versão do banco, imagem anterior e candidata. Não atualizar web/PWA durante coleta ativa. Salvar digests das imagens.

Em falha, reimplantar as imagens anteriores compatíveis, preservando volume e banco; não desfazer migrations por exclusão de tabelas. Se a imagem anterior não aceitar o esquema, entrar em manutenção e corrigir para frente. Depois verificar readiness, login, leitura e sincronização com os mesmos UUIDs.

Ensaio local reproduzível:

```powershell
node tests/operations/platform-maintenance.mjs
```

Após SA-03, retorno ao código legado é bloqueado. O ensaio atual para a API, verifica indisponibilidade e restaura a candidata preservando os dados. Não executar enquanto outro teste modifica a mesma homologação. Procedimento completo no guia 43.

## Backup e liberação

Seguir [backup e restauração](31-backup-e-restauracao.md) e [runbook](32-runbook-e-monitoramento.md). A VPS só fica liberada para a corrida após backup externo, restauração, alertas recebidos pelo responsável e validação dos aparelhos reais.


## Atualização SA-02 — painel da plataforma

Antes de habilitar /plataforma, seguir o [guia de runtime, chave MFA e bootstrap](41-super-admin-acesso-e-operacao.md). Aplicar migrations 007–010; configurar PLATFORM_DATABASE_URL e PLATFORM_MFA_KEY próprias do ambiente. Não reutilizar chave local na VPS. Esta ampliação não está coberta pelo manifesto antigo da Sprint 05; usar a candidata SA-06 e seguir o [roteiro da atualização](43-atualizacao-super-admin-deploy.md).
