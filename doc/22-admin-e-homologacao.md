# Administração e homologação — Sprint 01

## Acessar agora

Desenvolvimento: [abrir o sistema](http://127.0.0.1:5173). Foram criadas duas organizações sintéticas:

- Organização de teste A: admin@corrida-a.test.
- Organização de teste B: admin@corrida-b.test.

Não há senha fixa ou pública. Na tela de login, use **Esqueci minha senha**, informe um dos emails e abra a mensagem no [Mailpit de desenvolvimento](http://127.0.0.1:8025). O link permite definir uma senha de pelo menos 12 caracteres, expira em 30 minutos e funciona uma vez. O Mailpit é uma caixa local de testes; mensagens não são enviadas à internet.

Após redefinir, entre, crie um evento e adicione checkpoints. Apenas rascunhos podem ter estrutura editada. Use a aba Configuração para preparar, iniciar e encerrar captura. Toda transição exige motivo; início exige horário real. Alteração de senha revoga sessões anteriores.

## Instalação atualizada

Na raiz, preparar .env conforme o guia local e executar:

```powershell
npm.cmd ci
npm.cmd run db:up
npm.cmd run db:migrate
npm.cmd run db:runtime
npm.cmd run admin:create -- admin@corrida-a.test "Organização de teste A"
npm.cmd run admin:create -- admin@corrida-b.test "Organização de teste B"
npm.cmd run dev
```

Provisionar cada email somente uma vez. Conta já existente usa recuperação. admin:create usa a conexão de migration/admin e envia link de definição inicial, sem senha temporária reutilizável. Os nomes/emails acima são exclusivamente sintéticos. Para conta real, definir previamente organização e entrega SMTP.

db:runtime cria/rotaciona cronocheckpoint_runtime no PostgreSQL local e atualiza apenas .env. Reiniciar a API após rotação. DATABASE_URL passa a ser a conta restrita; MIGRATION_DATABASE_URL conserva a conexão de administração. Não executar esse comando em banco remoto: o script recusa hosts diferentes de localhost/127.0.0.1.

## Fluxos implementados

- Login por email/senha, seleção de organização para conta com mais de um vínculo, logout, sessão com inatividade de 30 min e limite absoluto de 12 h.
- Recuperação e primeiro acesso com token aleatório armazenado apenas como hash no banco.
- Eventos: criar/listar/consultar/editar rascunhos com modalidade única, data, fuso, local e distância opcional.
- Checkpoints: nome, tipo, ordem única, distância, ativação/desativação e versão concorrente.
- Estados disponíveis: rascunho → pronto → em andamento → encerrado; pronto → rascunho; encerrado → em andamento com nova janela, mantendo largada original.
- Histórico de alterações por evento, com autor, valores e motivo quando aplicável.
- Finalização/arquivamento bloqueados até a conciliação da Sprint 04; sem exclusão física de eventos/pontos.
- Acesso de campo, teclado e capturas permanecem na Sprint 02.

## Homologação local isolada

A [homologação HTTPS](https://localhost:5443) executa build compilado, API e banco próprios em containers separados do desenvolvimento. A [caixa de email da homologação](http://127.0.0.1:8026) também é separada. Não há publicação externa.

.env.homolog contém duas senhas hexadecimais independentes; não versionar. .env.homolog.example documenta as variáveis. No ambiente desta entrega, a configuração já foi gerada.

```powershell
npm.cmd run homolog:up
npm.cmd run homolog:stop
```

O primeiro comando faz build, aplica migrations em serviço separado, provisiona runtime limitado e inicia API/web. Só web e Mailpit têm portas expostas, vinculadas a 127.0.0.1. Banco não tem porta pública. A API não recebe a credencial de migration. Volumes preservam dados quando os serviços param.

HTTPS usa CA interna do Caddy. O certificado não foi instalado como confiável no Windows; o navegador comum pode mostrar aviso de confiança. O teste automatizado aceita esse certificado **somente** para https://localhost:5443, sem alterar configuração do sistema. Para exposição externa, escolher domínio/provedor e certificado público antes de liberar uso real. [Referência Caddy](https://caddyserver.com/docs/automatic-https#local-https).

### Provisionar um admin sintético na homologação

```powershell
docker compose -f infra/compose.homolog.yaml --env-file .env.homolog run --rm -e PUBLIC_ORIGIN=https://localhost:5443 -e SMTP_HOST=mailpit -e SMTP_PORT=1025 migrate node apps/api/dist/admin-cli.js admin@corrida-a.test "Organização de teste A"
```

Repetir com o email B somente na primeira configuração. Na homologação entregue, ambos já existem.

## Testes reproduzíveis

```powershell
npm.cmd run check
npm.cmd run test:integration
npm.cmd run test:e2e
```

E2E usa Edge instalado, aplicação de desenvolvimento ativa e admin@corrida-a.test provisionado. Ele recupera a senha, cria dados sintéticos e redefine a senha desse admin para valor aleatório; use recuperação novamente para acesso manual após o teste. Não usar em organização real. Nenhum token ou senha é impresso.

```powershell
$env:E2E_BASE_URL="https://localhost:5443"
$env:E2E_MAIL_URL="http://127.0.0.1:8026"
npm.cmd run test:e2e
```

PLAYWRIGHT_CHANNEL permite escolher navegador instalado. Capturas e relatório ficam em tmp/sprint-01, ignorado pelo Git. Repetições frequentes estão sujeitas aos limites de autenticação/recuperação; não desativá-los em produção.

## Limites da entrega

Validação em Edge com viewport móvel não substitui Safari iOS/Chrome Android reais. CI está configurada e comandos passam localmente; falta remoto Git para execução hospedada. Homologação é local, não serviço público nem ambiente operacional da corrida.
