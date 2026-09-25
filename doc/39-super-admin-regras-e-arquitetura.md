# SA-01 — Regras e arquitetura do painel da plataforma

Data: 23/09/2026. Especificação para implementação SA-02 a SA-06; nenhuma funcionalidade deste documento foi implantada. Decisões de implementação adotadas para o escopo autorizado, sujeitas a revisão explícita e versionada.

## Evidências do sistema atual

A migration 002 separa users, organizations e memberships; este último permite vários vínculos admin por usuário. auth.ts já devolve organizações após conferir senha e aceita organization_id no login; main.tsx já mostra a seleção. Sessão de organizador dura até 12 horas com inatividade de 30 minutos. Organizações e usuários têm active boolean; vínculos não possuem estado. O banco aplica FORCE RLS às entidades da prova usando contexto transacional app.organization_id. Auditoria existente exige organization_id e não cobre ações globais. rate-key.ts e capture.ts consultam organizations.active. Existem migrations 001 a 006; 006 é a renomeação TempoGo. Nenhum desses arquivos será reescrito para incluir o painel.

## Identidades e permissões

Uma identidade app.users pode ter vários vínculos organizacionais e, separadamente, um privilégio de plataforma. Compartilha email/senha; não compartilha sessões entre painéis. Ter privilégio global não cria vínculo organizacional automaticamente.

- Anônimo: login, recuperação e aceite de convite com prova válida. Não lista usuários ou organizações.
- Admin da organização: funções existentes no tenant selecionado. Não cria organizações, super admins ou privilégios globais. Sem acesso às APIs da plataforma.
- Operador: escopo atual de checkpoint, captura e pedido de revisão; nenhuma permissão nova.
- Super admin autenticado com MFA: consulta organizações, contas, vínculos, indicadores e auditoria global; cria convites, altera cadastros e executa transições. Não edita passagens, resultados ou auditoria e não entra como outro usuário.
- Operador técnico da VPS: comandos restritos de bootstrap e recuperação de emergência, fora da API pública, com registro obrigatório. Não é um papel concedido pelo frontend.

O painel fica em /plataforma e a API em /api/v1/platform. O organizador continua escolhendo a organização no login. Trocar contexto exige emitir nova sessão organizacional após validar o vínculo; nunca aceitar tenant vindo de header sem autenticação. Nas primeiras entregas, usar logout/login para trocar de organização, como fluxo existente.

Dados globais permitidos: cadastro, situação, responsáveis, vínculos, datas e contagens de eventos/checkpoints/passagens; eventos em andamento com ID, nome, data e organização. Não incluir números de peito, timestamps individuais, payloads offline ou CSV de passagens nas APIs globais.

## Sessões, MFA e recuperação

- Sessão da plataforma: máximo 8 horas, inatividade 15 minutos; token opaco aleatório de 32 bytes, hash no banco. Cookie cc_platform_session, Secure em produção, HttpOnly, SameSite=Strict, Path=/api/v1/platform, sem Domain. Guardas ignoram cc_session e cc_checkpoint.
- Desafio pré-MFA: 5 minutos, no máximo cinco tentativas e finalidade única (login ou cadastro de fator). Não autoriza consulta administrativa. Cookie distinto cc_platform_challenge no mesmo prefixo. Rotacionar token ao concluir MFA e remover desafio.
- TOTP: janela de 30 segundos, seis dígitos, tolerância de um intervalo anterior/posterior; rejeitar reutilização do último intervalo aceito de forma atômica. Segredo cifrado com AES-256-GCM, chave externa PLATFORM_MFA_KEY e key_id para rotação. Nunca registrar QR/segredo.
- Gerar dez códigos aleatórios de recuperação com pelo menos 128 bits cada, mostrados uma vez e armazenados somente como hashes. Uso único atômico. Código mais senha concede somente fluxo restrito de recadastro MFA; acesso completo só após validar o novo fator. Renovar códigos invalida os anteriores.
- Ações sensíveis exigem senha e TOTP confirmados nos últimos cinco minutos: privilégios, suspensão/encerramento, bloqueio global, transferência de responsável, troca de email, recuperação de MFA e revogação de todas as sessões. Token de confirmação fica associado à sessão/usuário, sem ampliar privilégio.
- Login: cinco falhas por identidade+IP em 15 minutos e vinte por IP; MFA: cinco por desafio e vinte por identidade em 15 minutos. Persistir limites, retornar 429 com Retry-After e respostas genéricas. Não aumentar cotas existentes do painel de provas.
- Recuperação de senha mantém token de 30 minutos e uso único. Como a identidade é compartilhada, redefinição revoga sessões organizacionais, sessões de plataforma e desafios; não remove MFA. Identidade sem vínculo organizacional também precisa conseguir recuperar senha pela entrada da plataforma.
- Perda de todos os fatores: outro super admin, com confirmação recente e motivo, emite autorização de recadastro de 30 minutos e revoga sessões. Destinatário precisa provar senha e receber token pelo email já verificado. Notificar o titular; não permitir trocar email na mesma operação.
- Sem outro super admin: comando local com acesso técnico restrito, confirmação de identidade por procedimento humano, motivo e auditoria antes de emitir autorização. Não concede sessão nem cria endpoint de bypass. Bootstrap só é permitido quando nunca houve privilégio global cadastrado; não pode ser reutilizado apagando/desativando contas.

Essas escolhas aplicam a exigência de reautenticação e proteção da recuperação descrita pela [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html); os prazos e limites acima são decisões do produto, não números prescritos pela referência.

## Estados e transições

Organização: pending → active pelo primeiro aceite; pending → closed por cancelamento; active → suspended por suspensão; suspended → active por reativação; active/suspended → closed por encerramento. closed é terminal nesta versão. Nome com 2–120 caracteres, responsável obrigatório para ativar, telefone opcional até 30 caracteres, email até 254, notas administrativas até 2.000. Dados de contato não alteram automaticamente a identidade de login.

Identidade: active=false bloqueia login e todas as sessões dos dois painéis; restaurar active=true exige novo login. Remoção de vínculo afeta apenas a organização selecionada. Privilégio global possui invited, active ou revoked; invited não conta como administrador disponível. Convite tem pending, accepted, cancelled ou expired; estado expired é derivado do prazo quando necessário.

Convite: validade 24 horas, token aleatório com hash, finalidade organization_admin ou platform_admin. Reenviar cancela o token anterior. Novo usuário define senha; usuário existente autentica sua identidade antes de aceitar, sem sobrescrever senha. Email normalizado e único. Convite não reativa usuário bloqueado. Para super admin, ativação do privilégio ocorre somente após completar MFA. Aceite, vínculo/privilégio e auditoria são atômicos.

Suspensão/encerramento: exigir versão, motivo de 10–1.000 caracteres e confirmação explícita se houver evento running, recalculada no servidor. Revogar sessões da organização, credenciais e sessões de checkpoint; invalidar convites pendentes da organização. Não alterar estado/horários da prova, observações ou evidências. Concessão offline antiga não pode ser aceita automaticamente quando a credencial tiver sido revogada. Exportação local continua acessível. Recuperação só após reativação, por admin autorizado e com revisão, conforme fluxo existente.

Reativar nunca desfaz revogação. Admins elegíveis voltam por novo login e emitem novos códigos para campo. Organização suspensa sem admin elegível deve receber e aceitar convite de substituição antes de voltar a active; aceite cria vínculo, mas não libera uso enquanto suspensa. Organização encerrada não aceita convites nem uploads e conserva dados.

Bloqueio de admin organizacional não revoga automaticamente credenciais de checkpoint emitidas por ele: pertencem à operação, não à sessão pessoal. O super admin vê essa informação; para interromper toda a operação deve suspender a organização. Transferência de responsável exige sucessor ativo já vinculado e não remove automaticamente o vínculo anterior.

## Concorrência e integridade

Toda alteração sensível ocorre em transação: autenticar/revalidar ator, adquirir locks, reler estado/versão, verificar regras, alterar e auditar. Escritas da prova e autenticação devem obter lock compartilhado da organização; suspensão obtém exclusivo. Operação iniciada antes pode concluir antes da suspensão; nenhuma escrita pode ser confirmada depois do commit de suspensão sem nova validação. Conferir também prepare, sync, recuperação e emissão de credenciais, não apenas login.

Serializar alterações de elegibilidade administrativa por um lock transacional global dedicado às operações de contas; depois bloquear organizações afetadas em ordem de UUID e usuários. O mesmo protocolo deve abranger bloqueio global, ativação, remoção de vínculo e concessão/revogação de privilégio. Contar somente usuários ativos com privilégio global ativo e MFA configurado; para organização active, contar vínculos ativos de usuários ativos. Nunca permitir contagem zero. Registrar conflito 409 e fazer rollback integral. Leituras contadas fora da transação não bastam.

Ao bloquear um usuário que é responsável, exigir sucessor para cada organização ativa afetada na mesma operação ou rejeitar com conflitos explícitos. Alteração de email exige prova do novo endereço, unicidade no commit e revogação de todas as sessões; não pode remover o único meio de recuperação antes da confirmação.

## Banco, isolamento e implantação

Escolha: manter uma API com módulo de plataforma encapsulado e segundo pool, usando PLATFORM_DATABASE_URL. Papel cronocheckpoint_platform independente de cronocheckpoint_app, NOSUPERUSER/NOBYPASSRLS, sem herança do papel do organizador. Guardas separados; nenhum fallback para o pool privilegiado. Credencial de migration só existe no job de migração.

O papel da plataforma pode administrar identidade, organizações, vínculos, convites e sessões conforme grants explícitos; inserir/consultar auditoria global sem UPDATE/DELETE. Leitura operacional é limitada a SELECT para contagens em transações com organização explícita, sob RLS existente; sem INSERT/UPDATE/DELETE em passagens/revisões/eventos. Inicialmente agregar por organização com processamento limitado e cache curto para visão geral, sem criar bypass global. O backend é a fronteira de autorização para definir o contexto; RLS não transforma um valor arbitrário de contexto em prova de identidade.

O papel do organizador não recebe acesso a tabelas MFA/sessões globais nem capacidade de criar privilégios. Ajustar somente os grants de identidade indispensáveis à autenticação e convites por módulos explícitos. Auditar todos os caminhos compartilhados de redefinição de senha. Startup valida cada pool/role separadamente e recusa superuser/bypass. Não executar SET ROLE para adquirir privilégios globais a partir do runtime do organizador.

Manter FORCE RLS, contexto local à transação e testes de reutilização do pool. A política de linhas complementa os grants, conforme a [documentação PostgreSQL 18](https://www.postgresql.org/docs/18/ddl-rowsecurity.html). Não planejar SECURITY DEFINER nesta entrega.

## Projeto de migração aditiva

Reservar números a partir de 007 após conferir o diretório na implementação; nomes abaixo são lógicos, não migrations já criadas.

1. platform_identity: privilege(user_id único, state, version, activated_at, revoked_at); MFA cifrado com versão da chave e último intervalo; hashes de recovery codes; sessões, desafios e autorizações de recadastro com finalidade, validade e consumo; audit global append-only. Provisionar papéis/grants e bootstrap guard permanente. Entrega SA-02.
2. organization_lifecycle: status, version, contatos e responsible_user_id em organizations; active/version em memberships; convites e outbox de email. Manter organizações atuais active=true como active, false como suspended. Não inventar responsável: preencher quando houver um único admin ativo; múltiplos/nenhum exigem seleção no painel e bloqueiam nova ativação até resolução, sem apagar acesso legado. Entrega SA-03.
3. account_administration: version em users, propostas de troca de email, comandos idempotentes e índices de gestão. Entrega SA-04; o mínimo para auditoria/idempotência deve ser antecipado conforme primeiro uso.

Manter organizations.active compatível com status=active por constraint e escrita única; durante backfill preencher antes de validar constraint. Migrations futuras são transacionais quando possível, com constraints/índices e grants explícitos. Não copiar users, recriar IDs ou recalcular evidências. Vínculo responsável deve apontar para membership da própria organização por FK composta, com validação de elegibilidade transacional.

Outbox persistida na transação de criação do convite; token de email cifrado com chave externa e removido após envio/cancelamento, hash mantido para validação. Worker usa tentativas limitadas e backoff, sem registrar conteúdo/token; falha SMTP não reverte a organização, exibe entrega pendente/falha e permite reenvio. Reprocessamento nunca recria vínculo.

Deploy com janela controlada: backup, migration, provisionamento dos dois runtimes, atualização da API, bootstrap por comando, MFA, smoke e abertura do acesso. Todas as rotas antigas devem respeitar status/vínculo antes de habilitar transições no novo painel. Não retornar automaticamente à versão anterior que ignore esses estados. Retorno seguro exige versão compatível ou manutenção e correção progressiva; restauração de backup requer conciliar escritas posteriores, nunca descarte silencioso.

## Aceite da especificação

A implementação deve demonstrar: cookie organizacional recusado na plataforma; desafio MFA sem privilégio; convite existente não reseta senha; usuário multi-organização isolado; suspensão concorrente com sync; reativação sem ressuscitar credenciais; bloqueio global sem órfãos; último super admin protegido sob duas requisições concorrentes; rollback da alteração se auditoria falhar; migrations com dados anteriores preservados. Casos e contratos estão no [documento de API](40-super-admin-contratos.md).
