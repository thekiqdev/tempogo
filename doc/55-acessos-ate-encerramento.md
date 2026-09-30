# Acessos disponíveis até o encerramento do evento

O cadastro e a redefinição de acesso não solicitam mais uma data de validade. Código e link ficam disponíveis enquanto o evento permite operação; revogar ou redefinir continua bloqueando o acesso anterior.

A migration 018 remove o vencimento dos acessos existentes e das sessões não revogadas. A API aceita o campo legado expires_at para compatibilidade, mas novos acessos são gravados sem vencimento.

- Rascunho, preparado e em andamento: login permitido em checkpoint ativo e organização ativa.
- Pausa para edição: sessão preservada, captura pausada pelas regras do evento.
- Encerrado, finalizado ou arquivado: login e chamadas autenticadas do operador bloqueados; interface indica Evento encerrado e desabilita emissão/redefinição.
- Reabertura: o mesmo acesso volta a funcionar, desde que não tenha sido revogado.

O encerramento é verificado pelo servidor a cada chamada. Um aparelho sem conexão só identifica o encerramento ao se comunicar novamente. Registros offline continuam preservados; sincronize antes de encerrar ou use o fluxo de recuperação da organização. A autorização offline de duas horas permanece independente da validade do acesso.

## Implantação

Executar npm run migrate no backend para aplicar 018_access_until_event_end.sql e publicar backend e frontend juntos. A migração já foi aplicada no ambiente local.

## Verificação

Lint, tipos, build e 18 testes unitários aprovados. Suíte de integração: 84 testes aprovados, incluindo acesso sem vencimento, pausa, bloqueio de sessão e login no encerramento, reabertura e conciliação.
