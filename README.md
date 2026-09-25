# TempoGo

Fundação do MVP de cronometragem manual para corridas de rua. Sprints 00 e 01 implementam web/API, acesso administrativo, organizações isoladas, eventos, checkpoints e auditoria. A Sprint 02 entrega acessos de checkpoint, teclado numérico e captura manual online. A Sprint 03 acrescenta preparação offline, sincronização, controle de relógio e recuperação administrativa. A Sprint 04 entrega painel filtrado, revisão imutável, CSV, conciliação e finalização auditada.

- [Sprint 05: qualidade e evidências](doc/sprints/sprint-05-execucao.md)
- [Deploy Contabo/Easypanel](doc/30-deploy-contabo-easypanel.md)
- [Runbook operacional](doc/32-runbook-e-monitoramento.md)
- [Painel, revisão e conciliação](doc/28-painel-revisao-e-conciliacao.md)
- [Registro da Sprint 04](doc/sprints/sprint-04-execucao.md)
- [Operação offline e recuperação](doc/26-offline-e-recuperacao.md)
- [Registro da Sprint 03](doc/sprints/sprint-03-execucao.md)
- [Captura manual e acessos](doc/24-captura-manual-e-acessos.md)
- [Registro da Sprint 02](doc/sprints/sprint-02-execucao.md)
- [Acessar o admin e homologação](doc/22-admin-e-homologacao.md)
- [Registro da Sprint 01](doc/sprints/sprint-01-execucao.md)
- [Guia de execução local](doc/20-desenvolvimento-local.md)
- [Convenções e CI](doc/21-engenharia-e-ci.md)
- [Registro da Sprint 00](doc/sprints/sprint-00-execucao.md)
- [Documentação do produto](doc/README.md)
- [Planejamento das sprints](doc/sprints/README.md)

## Início rápido

Requisitos: Node 22.19+ da linha 22, npm 10 e Docker Desktop com containers Linux.

```powershell
Copy-Item .env.example .env
# Edite .env: substitua a senha de exemplo nos três campos correspondentes.
npm ci
npm run db:up
npm run db:migrate
npm run db:runtime
npm run dev
```

No PowerShell, use `npm.cmd` se a política local bloquear `npm.ps1`.

Interface: http://127.0.0.1:5173. API: http://127.0.0.1:3001.
A página inicial é o login administrativo. Para usar as organizações sintéticas, consulte o guia de acesso acima.

```powershell
npm run check
npm run test:integration
```

O banco de testes é separado do de desenvolvimento. O teste de integração não aceita banco sem sufixo `_test`. Não usar credenciais de produção neste ambiente.

## Publicar no Easypanel

Consulte [configuração por serviço](doc/45-easypanel-configuracao.md). Exemplos: [backend](apps/api/.env.example) e [frontend](apps/web/.env.example). Dockerfiles: infra/Dockerfile.api e infra/Dockerfile.web, ambos com contexto na raiz.
