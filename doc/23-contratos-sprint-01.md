# Contratos implementados na Sprint 01

Complementa o desenho geral do documento 09. Prefixo /api/v1; JSON; datas UTC ISO 8601 nas respostas temporais, data da prova como YYYY-MM-DD. DTOs em packages/contracts/src/index.ts. Validação de entrada usa Zod no backend. Especificação OpenAPI completa continua prevista para B4/Sprint 02.

## Autenticação

POST /auth/admin/login: email, password, organization_id opcional. Retorna user, organization e csrf_token; caso existam múltiplas organizações e nenhuma seja escolhida, retorna organizations após validar a senha. Cookie cc_session HttpOnly, SameSite=Strict, Secure em HTTPS.

GET /auth/me retorna o contexto atual e csrf_token. POST /auth/logout revoga a sessão atual. Mutações exigem Origin exatamente igual a PUBLIC_ORIGIN; mutações autenticadas também exigem X-CSRF-Token. Cookies não ficam no localStorage.

POST /auth/password/forgot: email. Resposta genérica para email existente ou inexistente. Envio SMTP; desenvolvimento/homologação usam Mailpit local.

POST /auth/password/reset: token hexadecimal e password de 12 a 128 caracteres. Uso único, expiração de 30 min e revogação de sessões. Link usa /reset#reset=TOKEN, mantendo token fora do caminho enviado ao servidor HTTP. Senhas usam scrypt com salt aleatório; hash scrypt-v1, N=32768, r=8, p=3.

Limites: cinco tentativas de login por email/IP em 15 min; recuperação limitada por IP e email; limite global por IP. Ajustar o dimensionamento de proxy/rede compartilhada antes da operação em campo, sem confiar em cabeçalho de IP fornecido por cliente.

## Eventos

GET /events: limit (1–100, padrão 50), offset (padrão 0). Retorna items da organização autenticada. Paginação por cursor prevista para passagens não é necessária para esta lista administrativa.

POST /events: name, local_date, timezone, location, category_name, distance_m (inteiro positivo ou null). Retorna id com 201. Organização e criador são derivados da sessão; campos adicionais são rejeitados.

GET /events/:id: evento e modalidade. PATCH /events/:id: mesmos campos de criação mais expected_version. Somente rascunho. Alteração incrementa versão e grava auditoria na mesma transação.

POST /events/:id/transitions: target_state, expected_version, reason e gun_start_at somente no início. Fechar captura encerra janela; reabrir cria outra sem mudar largada. Finalized/archived respondem 409 RECONCILIATION_REQUIRED até implementação da conciliação.

## Checkpoints

GET/POST /events/:id/checkpoints. Criação: name, kind (start/intermediate/finish), sequence (inteiro positivo), distance_m (inteiro não negativo ou null), active (padrão true).

PATCH /checkpoints/:id: mesmos campos mais expected_version. Não há DELETE. Ordem única, distância crescente quando informada e limitada à modalidade. No máximo uma largada e uma chegada ativas; quando presentes, ocupam início/fim do percurso. Estrutura bloqueada fora de rascunho.

Alterações de checkpoint também incrementam a versão do evento, impedindo que uma transição use uma configuração que mudou sem conhecimento do admin.

## Auditoria e erros

GET /events/:id/audit retorna até 100 alterações mais recentes com ator, data e detalhes. Consulta técnica inicial, sem endpoint de edição/exclusão.

401: credencial/sessão inválida; 403: origem/CSRF; 404: recurso ausente ou de outra organização; 409: versão, estado ou constraint; 422: entrada/regra inválida; 429: limite; 500: erro interno genérico.

SQL é parametrizado. Transações definem contexto organizacional com set_config local; RLS e FKs compostas protegem tabelas de eventos/modalidades/checkpoints/janelas/auditoria. Identidade usa consultas globais estritamente mediadas pela autenticação. Runtime não é dono das tabelas nem superusuário e não tem BYPASSRLS; audit_events concede somente SELECT/INSERT.

Referências técnicas: [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [Node crypto](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback).
