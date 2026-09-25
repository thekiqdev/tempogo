# SA-02 — Primeiro super admin e acesso seguro

Data: 23/09/2026. Implementação local concluída; implantação externa não realizada.

## Entregas

- Painel separado em /plataforma, com login, recuperação, cadastro manual de autenticador, códigos de recuperação, sessão e logout.
- Backend com MFA obrigatório, desafio restrito, proteção contra replay/concorrência, limites persistentes, CSRF e Origin.
- Bootstrap técnico de uso único, recuperação emergencial auditada e runtime separado.
- Migrations aditivas 007/008 e invalidação por versão da identidade para cobrir troca de senha no painel antigo.
- [Guia de acesso e operação](../41-super-admin-acesso-e-operacao.md), exemplos de configuração e comandos npm.

## Evidências

npm run check aprovado: lint, tipos, 12 testes unitários e build. npm run test:integration aprovado: 53 testes, incluindo regressão anterior e suíte SA-02. npm run test:e2e:platform verifica banco/API reais, definição da senha, primeiro MFA, códigos, reload, logout, novo login e viewport 360 px. Evidência gerada em tmp/sa-02/browser.json e imagens do painel sem segredos.

A suíte SA-02 verifica runtime restrito, bootstrap único, CSRF/Origin, negação pré-MFA, cifra vinculada à identidade, replay TOTP, recuperação, invalidação após senha/bloqueio, recuperação emergencial, expiração por inatividade, consumo concorrente de desafio e auditoria append-only. Os testes unitários usam vetores RFC e adulteração da cifra.

## Decisões de implementação

- Reutilizado envelope de erros atual (422 para validação) em vez de introduzir convenção divergente do restante da API.
- auth_version invalida logicamente sessões/desafios da plataforma após alterações na identidade; não concede ao runtime organizacional acesso a tabelas MFA.
- Acrescentada migration 008 para auditoria transacional do reset legado. O papel organizacional só pode inserir nesse histórico global; não lê, altera ou apaga.
- Notificações MFA são tentadas após commit; fila persistente de email virá na SA-03.
- Painel começa com acesso seguro e estado informativo. Cadastro de organizações e gestão de super admins adicionais permanecem SA-03/04.

## Limites da entrega

A conta pessoal inicial não foi criada, pois o email do titular não foi informado. Bootstrap por comando está funcional e documentado. Não existe senha temporária fixa. Variáveis locais foram configuradas sem exibir segredos; não foram copiadas para VPS. O teste de navegador desta etapa usa HTTP em loopback; TLS real, SMTP externo, restauração com chave MFA, recuperação operacional por equipe e homologação final permanecem SA-06.

Próxima etapa: SA-03 — organizações, primeiro responsável, convites e transições.
