# SA-03 — Organizações e convites

Data: 23/09/2026. Implementada e validada localmente.

Entregue: cadastro e edição de organizações, pesquisa/paginação, detalhe com contagens, convite do responsável e de admins, aceite por nova identidade ou senha da identidade existente, reenvio/cancelamento e fila persistente de email. O painel mostra situação de entrega e permite atualizar a consulta.

A organização nasce pending e o primeiro aceite válido ativa o cadastro. Suspender/encerrar exige motivo, versão e confirmação do impacto; revoga sessões organizacionais e de campo, credenciais e convites. Reativar não ressuscita acessos. Encerramento é terminal nesta versão. Transferência exige membro ativo.

A migration 009 preserva IDs e active legado, adiciona estado/versionamento, responsável por FK composta, convites, outbox e idempotência. Backfill só seleciona responsável quando existe exatamente um admin elegível. Registros de corrida permanecem sob RLS. A API global retorna contagens, não passagens individuais. O runtime da plataforma pode ler entidades de prova sob contexto RLS para contagens, mas não escrever/apagar passagens.

## Validação

- npm run check: lint, tipos, 12 testes unitários e build aprovados.
- npm run test:integration: 61 testes aprovados, incluindo sete cenários SA-03 e regressão anterior.
- Jornada navegador com backend/PostgreSQL reais: criação, envio pelo worker com adaptador de teste, aceite do responsável, suspensão, reativação e viewport 360 px; sem erros JavaScript. Evidência tmp/sa-03/browser.json e imagens sem segredos.
- Suspensão concorrente testada: aguarda transação da organização, impede transação seguinte e preserva evento. A fila offline continua no navegador; o servidor recusa uploads quando suspenso. Não foi repetido ensaio físico de celulares nesta etapa.
- Falha SMTP simulada preserva convite; retry e reenvio testados. Dois aceites simultâneos produzem uma ativação. Senha de identidade existente permanece igual.

## Detalhes operacionais

Worker a cada dez segundos, lease de um minuto, até cinco tentativas com backoff. Após falha final, usar Reenviar para gerar novo token. Email pode repetir após queda entre envio e confirmação; o token continua de uso único. Token cifrado na fila com chave externa PLATFORM_MFA_KEY e domínio de cifra específico; hash no convite. A fila apaga o token cifrado após envio/cancelamento/falha final. Não substitui SMTP real validado na VPS.

Escritas do painel exigem Idempotency-Key e confirmação recente de senha/MFA. Paginação nesta implementação usa UUID crescente como cursor estável; não é ordem cronológica. Contratos do documento 40 são ajustados por esta decisão. Gerenciamento de usuários e convites globais continua na SA-04.

Locks compartilhados por organização foram adicionados ao helper de transação dos fluxos de prova. Suspensão usa lock exclusivo da mesma chave antes de alterar estado, evitando commit de nova escrita depois da suspensão. O contexto RLS continua local à transação.

Migration aplicada somente ao desenvolvimento local e bancos sintéticos de teste; não houve deploy externo. Próxima etapa autorizada: SA-04.
