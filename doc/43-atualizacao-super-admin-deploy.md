# TempoGo — atualização do super admin e entrega para deploy

Data: 24/09/2026. Candidata validada localmente; publicação na Contabo/Easypanel executada pelo usuário.

## Preparar a atualização

1. Conferir o [manifesto da candidata](releases/super-admin-candidate.json) e as [evidências](releases/super-admin-evidence.json). Usar Dockerfiles infra/Dockerfile.api e infra/Dockerfile.web. Registrar digest efetivamente instalado; os IDs das imagens locais não são URLs de um registry público.
2. Definir janela sem corrida ativa. Orientar operadores a sincronizar ou exportar filas antes da manutenção; nunca limpar IndexedDB para atualizar.
3. Fazer backup do banco e testar restauração em ambiente separado. Guardar PLATFORM_MFA_KEY em cofre externo ao servidor, separado do backup do banco. A chave deve ser preservada entre reinícios/atualizações. Não copiar chaves locais para produção nem gerar uma nova a cada deploy.
4. Registrar responsáveis técnico, super admins e atendimento. Conferir HTTPS, SMTP real, alertas e capacidade da VPS. Essas configurações não foram acessadas nesta execução.

## Banco, runtime e bootstrap

Em job temporário com MIGRATION_DATABASE_URL, aplicar todas as migrations existentes (001–010); banco anterior até 006 recebe 007–010. Não editar SQL já aplicado.

```sh
node apps/api/dist/migrate-cli.js
```

Em instalação nova, provisionar runtime organizacional conforme guia 30. Para a plataforma, definir EXPECTED_DATABASE_NAME e PLATFORM_RUNTIME_PASSWORD aleatória e executar:

```sh
node apps/api/dist/provision-platform-runtime.js
```

Se a role já existir, preservar a credencial e conferir o vínculo de permissão; não executar rotação improvisada. Configurar na API permanente DATABASE_URL do runtime organizacional, PLATFORM_DATABASE_URL do runtime independente da plataforma, PLATFORM_MFA_KEY de 64 caracteres hexadecimais aleatórios, PUBLIC_ORIGIN HTTPS e SMTP. Exemplo em infra/production.env.example. Retirar MIGRATION_DATABASE_URL e senhas de provisionamento do serviço permanente. A API verifica permissões dos dois runtimes e readiness depende das duas conexões.

Para o primeiro super admin, usar job temporário com email real confirmado, SMTP e origem pública:

```sh
node apps/api/dist/platform-cli.js bootstrap EMAIL_CONFIRMADO
```

Não há conta padrão. O link de definição de senha vai por email; depois o titular cadastra MFA e guarda os códigos. Bootstrap repetido é recusado. Para cadastrar organizadores, usar o painel da plataforma e convites; o comando legado admin-cli continua somente como ferramenta técnica, sem necessidade no onboarding normal. Após bootstrap, desabilitar o job e retirar seus segredos.

Cadastros anteriores: a migration preserva active e vínculos. Quando há exatamente um admin ativo, ele vira responsável. Organizações com vários admins permanecem sem responsável definido e devem ter um escolhido no painel antes da operação. Suspensão/encerramento preservam registros de corrida.

## Conferência após publicação

- Readiness e liveness respondem; /api/v1/operations/metrics não é público.
- /plataforma exige senha e MFA; sessão de organizador não acessa APIs globais. Cookies em HTTPS são Secure/HttpOnly/SameSite Strict.
- Convites e recuperação chegam pelo SMTP real. Criar organização de teste e convidar responsável, confirmar isolamento e criar uma prova sintética.
- Convidar segundo super admin e concluir MFA; verificar proteção do último administrador, revogação e auditoria.
- Capturar online/offline, reconectar, revisar e exportar CSV. Conferir Android/iPhone e navegadores reais disponíveis; viewport simulado não substitui aparelho físico.
- Conferir backup externo, cópia da chave MFA e alertas recebidos. Remover/desativar acessos sintéticos pelo ciclo lógico apropriado, preservando auditoria.

## Falha e retorno seguro

Não voltar a imagens anteriores à atualização de autorização. Elas podem ignorar suspensão e bloqueio de vínculo mesmo aceitando o esquema novo. O ensaio legado tests/operations/rollback.mjs agora recusa banco que já recebeu 009.

Em falha crítica, colocar o serviço em manutenção, preservar banco/filas/chave MFA e corrigir para frente. Só usar imagem anterior se ela já implementar as mesmas regras de acesso e tiver sido validada com o esquema atual. Nunca desfazer migrations apagando tabelas. Restaurar backup é recuperação de incidente com reconciliação dos dados posteriores, não um rollback automático.

Ensaio local aprovado: API parada, readiness indisponível, retorno da mesma candidata e integridade das passagens conferida. Restauração lógica em banco separado também preservou dados anteriores e MFA com a chave correta. Não foi feito rollback para binário legado nem restauração na VPS.

## Reproduzir verificações locais

```powershell
npm run check
npm run test:integration
npm run test:e2e:platform
npm run test:e2e:platform-release
npm run test:platform-upgrade
npm run test:platform-maintenance
npm run release:platform
```

E2E de plataforma usa bancos únicos sintéticos, Edge, HTTP loopback e SMTP Mailpit local. O cenário offline roda como parte de platform-release; não executar platform-offline isolado sem sua fixture. A homologação HTTPS é reconstruída por npm run homolog:up; .env.homolog agora exige também HOMOLOG_PLATFORM_PASSWORD e HOMOLOG_PLATFORM_MFA_KEY independentes (exemplo sem segredos no repositório). Ensaios de manutenção e regressão HTTPS não devem rodar simultaneamente.

## Limites da liberação

Aceite técnico local concluído. Permanecem fora desta execução: deploy, domínio/certificado da VPS, SMTP real, backup externo/alertas, responsáveis nominais e ensaio em aparelhos físicos/corrida real. Nenhuma conta real de super admin foi criada. O MVP permanece web e manual, sem IA; futuras fases seguem o roadmap original.

## Candidata da reorganização CRM (UX-SA-01 a 06)

A atualização visual usa o manifesto [super-admin-ux-candidate.json](releases/super-admin-ux-candidate.json) e as [evidências UX](releases/super-admin-ux-evidence.json). A candidata SA anterior permanece referência histórica; suas imagens não contêm a nova interface.

Recriar imagens API e web a partir da candidata UX antes de publicar pelo Easypanel. Não há migrations novas nesta rodada; continuam válidas as migrations 001–010 e as orientações de backup, chave MFA e acesso restrito. O teste em loopback usa builds atuais da API/web, PostgreSQL real e SMTP local; não comprova domínio, TLS ou entrega do provedor externo.

Validação adicional após o deploy: abrir diretamente /plataforma/pessoas e uma ficha de organização, recarregar, pesquisar/filtrar, usar menu móvel e confirmar ação sensível. A aplicação web precisa manter fallback de rotas para index.html. Conferir convites públicos e sessão do organizador.

Reproduzir a verificação da interface: npm run check; npm run test:integration; npm run test:e2e:platform-ux; npm run test:e2e:platform-release. Gerar manifesto com npm run release:platform-ux somente após a última alteração de código.
