# Sprint 01 — Registro de execução

Data: 16/09/2026. Estado: implementada e validada em desenvolvimento e homologação local HTTPS.

O usuário solicitou iniciar a Sprint 01 e depois orientou continuar. Isso autorizou o avanço técnico; não transforma as decisões de escala, equipe e primeira corrida da Sprint 00 em informações confirmadas.

## Implementado

- S01-01: migration 002 com organizações, usuários, vínculos, sessões, recuperação, eventos, modalidade única, checkpoints, janelas e auditoria. Duas organizações sintéticas provisionadas.
- S01-02: definição inicial de senha por link de uso único, login, logout, expiração, recuperação, revogação por reset e limitação de tentativas.
- S01-03: sessão HttpOnly/SameSite, Secure em HTTPS, proteção de origem/CSRF e telas de acesso.
- S01-04: cadastro/edição de eventos e checkpoints com validação estrita, índices, constraints e contratos.
- S01-05: interface responsiva com organização/evento visíveis, listagem paginada, formulário e navegação.
- S01-06: estados até closed, retorno a draft, reabertura com janela nova, horário de largada e controle concorrente. Finalização/arquivamento dependem da Sprint 04 e são explicitamente bloqueados.
- S01-07: auditoria atômica de identidade/configuração; consulta por evento; runtime sem UPDATE/DELETE de auditoria.
- S01-08: homologação local isolada com banco/segredos próprios e HTTPS Caddy; não publicada externamente.
- S01-09: testes integrados de autenticação, isolamento, FKs, pool reutilizado, concorrência, regras de percurso e auditoria.

## Evidências

npm run check passou: lint, tipos, quatro testes unitários e build.
npm run test:integration passou: dez cenários administrativos dentro de uma suíte e um teste de migrations; Node reporta 12 resultados incluindo a suíte pai.
npm run test:e2e passou em desenvolvimento: recuperar senha, login, criar corrida, cadastrar três checkpoints, transitar estados, consultar histórico e logout.
Capturas de login, checkpoints e lista móvel foram inspecionadas. Sem erros JavaScript ou overflow horizontal no cenário aprovado.

Os testes no navegador identificaram e levaram à correção de três falhas: link de recuperação passou a usar rota própria; selects receberam nomes acessíveis explícitos; requisições sem corpo deixaram de enviar Content-Type JSON vazio, corrigindo logout.

## Segurança e autorizações

A revisão automática inicialmente bloqueou o usuário restrito do banco por exigir autorização específica. Após explicar o escopo e receber “continue”, a operação local foi autorizada e executada. Runtime usa cronocheckpoint_runtime sem privilégios administrativos; .env guarda credencial aleatória e está ignorado. A homologação usa outra instância e senhas independentes.

O bloqueio anterior de propriedade de .git permanece fora desta entrega; nenhuma ACL foi alterada. Não houve commit, push ou publicação externa.

## Limites e próximo passo

Homologação local não substitui hospedagem pública com certificado confiável. O certificado interno não foi instalado no Windows. Falta definir provedor/domínio e conectar remoto para CI hospedada; as verificações equivalentes foram executadas localmente.

Dados são sintéticos; emails ficam nos Mailpits locais. Não há acesso de operador, código/senha de checkpoint, teclado de captura, passagens, ranking ou IA. Esses acessos e captura são o objetivo da Sprint 02. Ensaios em aparelhos reais e campo permanecem nas sprints previstas.

Guias: [acesso e homologação](../22-admin-e-homologacao.md), [contratos](../23-contratos-sprint-01.md).

## Fechamento técnico

Build final e testes passaram. E2E repetido com sucesso em https://localhost:5443 usando banco separado e cookie Secure/HttpOnly/SameSite. O teste também verificou checkpoints e lista em viewport móvel sem overflow. Homologação acessível somente nesta máquina, sem instalação de confiança de certificado no Windows. Todos os itens técnicos S01-01 a S01-09 marcados como entregues nesse escopo local; aceite operacional de uma corrida real permanece futuro.
