# SA-01 — Contratos e cenários de aceite

Data: 23/09/2026. Contratos projetados, não endpoints implementados. Regras completas em [arquitetura e permissões](39-super-admin-regras-e-arquitetura.md).

## Convenções

Prefixo /api/v1/platform; JSON estrito, propriedades desconhecidas rejeitadas. IDs UUID, timestamps ISO UTC, email normalizado. Requisições mutáveis exigem Origin autorizado e X-CSRF-Token vinculado à sessão; desafios pré-MFA têm CSRF próprio. Login/forgot exigem Origin mesmo sem sessão. Cookies de outros painéis não autenticam estas rotas. Tokens de convite/reset chegam ao frontend em fragmento de URL e são enviados em POST; nunca em query ou logs. Respostas privadas Cache-Control: no-store.

Resposta de erro: {error:{code,message},request_id}; detalhes de conflito só para ator autorizado. Códigos HTTP: 400 validação; 401 sessão/credencial inválida; 403 permissão, CSRF ou confirmação recente ausente; 404 recurso inexistente ou fora do escopo; 409 versão, transição, último admin ou email em uso; 410 convite expirado/cancelado após validação do token; 429 limite com Retry-After; 503 dependência indisponível. Convite aleatório inválido retorna erro genérico sem dados cadastrais. Login e forgot não revelam existência da conta.

Listas aceitam limit (padrão 25, máximo 100), cursor opaco e filtros permitidos. Ordenação estável created_at DESC,id DESC; retorno {items,next_cursor}. Cursor inválido retorna 400, sem SQL dinâmico a partir do cliente. Busca q até 120 caracteres. Audit aceita período até 90 dias por consulta. Métricas com generated_at e dados possivelmente em cache por até 60 segundos.

Toda edição exige version inteiro atual; retorno traz version incrementado. POST de criação e ações sensíveis exige Idempotency-Key UUID: persistir ator, operação, hash do corpo e resposta sanitizada por 24 horas. Repetição idêntica devolve resultado anterior, corpo diferente retorna IDEMPOTENCY_CONFLICT. Revalidar autorização atual antes de devolver replay; nunca armazenar senha, TOTP ou token bruto nesse mecanismo. Login, MFA e aceite usam seus próprios desafios/tokens de uso único, sem cache de credenciais.

## Autenticação — SA-02

- POST /auth/login: {email,password}. Retorna 202 {next: mfa_verify ou mfa_enroll, csrf_token,expires_at}, cookie de desafio; nenhuma identidade sem privilégio global invited/active prossegue. Credenciais inválidas: 401 genérico.
- POST /auth/mfa/enroll: desafio de cadastro + CSRF, sem corpo. Retorna segredo/otpauth_uri uma única vez nesta sessão de cadastro, antes da confirmação; não ativa privilégio.
- POST /auth/mfa/confirm: {code}. Confirma fator, ativa privilégio elegível, emite sessão e códigos de recuperação uma vez. Consome desafio na mesma transação.
- POST /auth/mfa/verify: {code}. Consome desafio de login, confere replay TOTP, emite sessão; retorna {user:{id,email},csrf_token,expires_at}.
- POST /auth/mfa/recovery: {recovery_code}, com desafio de login após senha. Consome código e autoriza somente recadastro, revogando sessões anteriores.
- GET /auth/me: sessão completa; retorna identidade, MFA habilitado, expires_at, csrf_token e reauthenticated_until. Sem segredo MFA.
- POST /auth/reauthenticate: {password,code}; retorna reauthenticated_until para cinco minutos.
- POST /auth/logout: revoga sessão, limpa cookies, 204; repetir logout sem sessão também limpa cookies sem conceder acesso.
- POST /auth/password/forgot: {email}; 202 genérico. POST /auth/password/reset: {token,password}; sucesso 204 e todas as sessões/desafios da identidade revogados; MFA preservado.
- POST /auth/mfa/reset/accept: {token,password}; autorização de recuperação previamente emitida, uso único; cria apenas desafio de recadastro. Não fornece sessão administrativa.

## Organizações — SA-03

Todos os endpoints abaixo exigem super admin com sessão completa. Escritas exigem CSRF; criação, convites, transições e transferência exigem confirmação recente.

- GET /organizations: filtros q,status; itens {id,name,status,responsible_user_id,contact_email,contact_phone,version,created_at}.
- POST /organizations: {name,contact_email,contact_phone?,responsible_email,notes?}. 201 {organization,invitation:{id,status,delivery_status}}; organização pending, convite inicial criado atomicamente. Não retornar token de convite.
- GET /organizations/:id: cadastro, responsável, contagens operacionais e avisos de pendência. Sem payloads de passagens.
- PATCH /organizations/:id: {version,name?,contact_email?,contact_phone?,notes?}. Não aceita status nem responsável por este endpoint.
- POST /organizations/:id/transitions: {version,to,reason,acknowledge_running_events:boolean}. Retorna organização atualizada e quantidade de acessos revogados. Relações de estado seguem o documento 39; confirmação ausente com prova ativa retorna RUNNING_EVENTS_CONFIRMATION_REQUIRED, sem alterar dados.
- POST /organizations/:id/responsible: {version,user_id,reason}. Sucessor já ativo/vinculado, senão 409; retorno atualizado. Não transfere eventos nem remove o responsável anterior.
- GET /organizations/:id/members: paginação, filtro active; retorna identidade resumida, papel, estado do vínculo e version.

## Convites — SA-03/04

- POST /invitations: {kind:organization_admin|platform_admin,email,organization_id?}. organization_id obrigatório apenas para convite organizacional; convite global somente super admin com MFA recente. Recusar convite para organização closed e duplicata pending do mesmo escopo com 409; indicar reenvio.
- GET /invitations: filtros kind,status,organization_id; dados de situação e entrega, sem token.
- POST /invitations/:id/resend: {version}; invalida token anterior, emite outro, estende prazo e agenda email. POST /invitations/:id/cancel: {version,reason}; invalida token, 200 com estado atualizado.
- POST /invitations/inspect: {token}; prova de posse autoriza somente escopo mínimo {kind,organization_name?,expires_at,existing_identity:boolean}, sem listar vínculos.
- POST /invitations/accept: {token,password}; para nova identidade cria senha; para existente verifica senha atual, nunca a altera. Convite de organização: 200 {next:organization_login}; convite global: 202 desafio restrito {next:mfa_enroll|mfa_verify,csrf_token,expires_at}. Privilégio invited só vira active após MFA; vínculo de organização só é criado se token válido e usuário não bloqueado.
- Repetição após consumo não emite novas sessões ou privilégios; responde INVITATION_ALREADY_USED. Primeiro aceite do responsável inicial ativa organização pending; aceite em suspended cria vínculo sem ativar organização.

## Contas e privilégios — SA-04

- GET /users: filtros q,active,organization_id,platform_state; dados cadastrais, estados e vínculos resumidos.
- GET /users/:id: detalhe, vínculos, presença de MFA e sessões resumidas sem hashes/tokens.
- POST /users/:id/status: {version,active,reason,responsible_replacements?:[{organization_id,user_id,version}]}; bloqueio global verifica invariantes em todas as organizações afetadas e plataforma, faz substituições necessárias e revoga sessões de ambos os painéis atomicamente.
- POST /organizations/:id/members/:userId/status: {version,active,reason}; bloqueia/restaura vínculo sem bloquear identidade. Revoga sessões da organização; recusa último admin e responsável sem transferência prévia.
- POST /users/:id/sessions/revoke: {scope:all|platform|organization,organization_id?,reason}; alcance validado, 200 {revoked_count}; não revoga códigos de checkpoint por associação ao emissor.
- POST /users/:id/password-reset: {reason}; agenda email, 202; não exibe token/senha.
- POST /users/:id/email-change: {version,new_email,reason}; 202 com proposta de alteração. POST /email-change/confirm: {token,password}; aplica após autenticar identidade, provar email novo e conferir unicidade; revoga sessões e notifica email antigo. Token de 30 minutos e uso único.
- POST /super-admins/:userId/revoke: {version,reason}; confirmação recente obrigatória, protege último super admin; revoga sessões/desafios globais, preserva vínculos organizacionais. Nova concessão exige novo convite.
- POST /super-admins/:userId/mfa-reset: {reason}; confirmação recente do ator e usuário alvo diferente; agenda autorização restrita e notificação. Não remove o fator ativo antes de confirmar substituto; sessões antigas são revogadas e login normal fica bloqueado enquanto recuperação pendente. Último administrador requer procedimento técnico quando não houver outro ator habilitado.

A remoção de privilégio, bloqueio, consumo de código/token e reenvio devem usar locks, não apenas checagens na interface. Não existe DELETE físico de usuários/organizações nesta versão.

## Consulta e auditoria — SA-05

- GET /overview: contagens por situação, convites pendentes, usuários e eventos running, generated_at; limites de consulta e cache definidos no servidor.
- GET /organizations/:id/usage: contagens de eventos, checkpoints, observações; exclui itens individuais.
- GET /events: filtros organization_id,state=running, paginação; metadados mínimos de prova.
- GET /audit: filtros actor_id,organization_id,action,from,to; paginação. Retorno {id,actor_id,action,target_type,target_id,organization_id?,before?,after?,reason?,request_id,created_at}. before/after usam allowlist de campos; não incluem hash de senha, segredo, token ou dados de passagem.

Catálogo mínimo: platform.login/logout, mfa.enrolled/recovered/reset_requested, platform_privilege.invited/activated/revoked, organization.created/updated/suspended/reactivated/closed, membership.activated/blocked, responsible.changed, user.blocked/reactivated/email_changed, invitation.sent/resent/cancelled/accepted, sessions.revoked, bootstrap.executed e emergency_recovery.requested. Alterações e auditoria na mesma transação; falhas de autenticação vão a log sanitizado com correlação e limites para evitar amplificação.

## Cenários de aceite a implementar

SA-T01: cookie de organizador/campo e header de privilégio inventado não acessam a plataforma.
SA-T02: desafio pré-MFA não lista organizações; token expirado, código repetido e recuperação reutilizada são recusados.
SA-T03: senha redefinida revoga sessões de ambos os painéis sem remover MFA.
SA-T04: dois convites concorrentes/aceites/reenvios não duplicam identidade, vínculo ou privilégio.
SA-T05: identidade existente precisa da própria senha ao aceitar; email de contato não altera login.
SA-T06: multi-organização com troca de contexto preserva isolamento inclusive no pool reutilizado.
SA-T07: bloqueio global e remoções simultâneas não eliminam último admin elegível; rollback preserva todos os vínculos.
SA-T08: suspensão concorrente com sync tem ordem transacional definida; fila offline preservada, credencial revogada recusada e recuperação após reativação auditada.
SA-T09: falha SMTP mantém convite recuperável; reenvio invalida token antigo e não duplica organização.
SA-T10: falha na auditoria reverte mutação; API não edita/apaga auditoria.
SA-T11: runtime da plataforma não escreve observações e runtime organizacional não lê MFA nem cria privilégios.
SA-T12: backfill mantém IDs, hashes e totais; organizations.active/status permanecem coerentes; responsável ambíguo gera pendência visível.
SA-T13: replay idempotente exige autorização atual e não devolve segredo; conflito de versão retorna 409 sem escrita parcial.
SA-T14: bootstrap não reabre após desativação; procedimento emergencial exige auditoria e não cria sessão completa sem MFA.
SA-T15: regressão das jornadas manuais e testes pós-deploy, incluindo CSRF, paginação inválida, rate limit e recuperação de chave MFA.

Esses cenários são especificação; sua execução e evidências pertencem às etapas de implementação e SA-06.
