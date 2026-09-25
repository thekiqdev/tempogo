# TempoGo — manual do super admin

Data: 24/09/2026.

## Acesso e responsáveis

Entrar em /plataforma com conta pessoal e autenticador. Organizadores entram no painel de eventos; operadores usam código e senha de checkpoint. Confirmar identidade novamente quando solicitado para operações sensíveis. Guardar códigos de recuperação fora do navegador.

Antes da publicação, designar responsável técnico pelo deploy/backup, super admins titulares/substitutos, atendimento e coordenador da corrida. O usuário fará o deploy; os demais nomes ainda não foram fornecidos. Não criar contas compartilhadas para preencher essa pendência.

## Onboarding

1. Abrir Organizações no menu lateral, confirmar identidade pelo menu da conta quando necessário e escolher Nova organização. Informar nome, contato e email do primeiro responsável.
2. Conferir organização pendente e entrega do convite. Link válido por 24 horas; identidade existente confirma a própria senha, nova identidade define senha.
3. Após aceite, atualizar situação e conferir organização ativa/responsável. Testar login no painel de eventos.
4. Em falha de email, conferir SMTP e reenviar: o token anterior é invalidado. Cancelamento exige motivo; nenhuma senha é exibida ao super admin.

## Contas e privilégios

Pesquisar email e selecionar conta. Bloqueio global afeta todos os vínculos; bloqueio de vínculo afeta somente a organização escolhida. Revogação permite todas as sessões, plataforma ou uma organização. Reativar vínculo não reativa identidade globalmente bloqueada.

Para transferir responsabilidade, convidar sucessor, aguardar aceite e selecionar membro ativo no detalhe da organização. Depois bloquear o responsável anterior. O servidor protege o último administrador elegível.

Troca de email exige link enviado ao novo endereço e senha atual. O email anterior permanece válido até o aceite; depois as sessões são revogadas e o endereço antigo recebe aviso. Nunca enviar senhas por atendimento.

Convite global de super admin exige aceite e MFA antes de liberar acesso. Revogar privilégio preserva vínculos organizacionais. Recuperação MFA de outra pessoa exige motivo/confirmação recente, revoga sessões e autoriza recadastro com senha e token. Para o único super admin, seguir CLI restrita e auditada do [guia 41](41-super-admin-acesso-e-operacao.md).

## Suspensão, reativação e encerramento

Conferir provas em andamento, informar motivo e confirmar impacto. Suspensão bloqueia novas operações online e revoga acessos aplicáveis. Aparelhos offline preservam dados locais; não limpar armazenamento enquanto houver pendências. Exportar pacote local, reativar quando aprovado e usar recuperação administrativa com revisão no painel de eventos. Emitir novos acessos; reativação não ressuscita sessões/credenciais revogadas.

Encerramento é terminal e lógico nesta entrega. Histórico é preservado; não significa eliminação de dados pessoais.

## Indicadores e auditoria

Visão geral mostra organizações por situação, contas, convites válidos pendentes e falhas históricas de email. Uma falha histórica não significa um convite atualmente pendente de correção. Contagens paginadas por organização incluem eventos, provas em andamento, checkpoints e passagens. Não são classificação oficial e não permitem editar passagens. Atualizar consulta busca nova fotografia; dados simultâneos podem alterar totais entre consultas.

Auditoria permite pesquisar e selecionar a pessoa e a organização pelo nome/email, escolher uma ação do catálogo ou informar o código exato, e definir o período. Os atalhos de 7/30/90 dias preenchem as datas; Consultar auditoria aplica a seleção. Padrão 30 dias, máximo 93 dias por consulta; Mais ações preserva o período. Expandir Detalhes por teclado/toque para conferir recurso, mudanças e request ID. Horários aparecem no fuso do aparelho. Não há edição/exclusão pelo painel ou pelos runtimes.

Registram-se autenticação/MFA/recuperação, convites, organizações, responsáveis, vínculos, identidades e privilégios. Tentativas administrativas já autenticadas que falham após validação do acesso registram management.denied com operação/código, sem copiar payload. Falhas anônimas, validação anterior à transação e limites ficam na proteção/logs técnicos; a tela não é um histórico completo de tentativas. Falha ao auditar uma alteração cancela a alteração; falha ao auditar tentativa já rejeitada gera alerta sanitizado.

Conflito de versão: atualizar cadastro e conferir antes de repetir. MFA recente: Confirmar identidade e reenviar com formulário preservado. Erro 429: aguardar prazo. Erro de conexão: repetir mesmo comando preserva idempotência; mudar dados gera outro comando.

## Consultas SA-05

Prefixo /api/v1/platform. GET /overview; GET /organization-metrics (q, cursor UUID, limit 1–25, padrão 10); GET /audit (actor_id, organization_id, action, from/to ISO, cursor opaco, limit 1–100, padrão 25). Sessão MFA obrigatória. Cursor de auditoria preserva microssegundos e ID para empates. SQL limitado a 3–5 segundos por consulta e páginas limitadas; leituras operacionais mantêm contexto RLS. Sem BYPASSRLS ou endpoint de passagens individuais.

## Navegação do painel CRM

- Visão geral: /plataforma — resumo e atividade recente.
- Organizações: /plataforma/organizacoes — pesquisar, filtrar, criar e abrir ficha. Abas: Resumo, Cadastro, Pessoas e acessos, Convites e Histórico.
- Pessoas: /plataforma/pessoas — identidade global e vínculos organizacionais.
- Super admins: /plataforma/super-admins — contas com privilégio de plataforma e novos convites globais.
- Convites: /plataforma/convites — consulta unificada, filtros, última entrega, reenvio e cancelamento.
- Auditoria: /plataforma/auditoria — histórico administrativo somente leitura.

No celular, abrir Menu. Escape ou Fechar menu retorna o foco ao botão. O menu da conta, no cabeçalho, reúne Confirmar identidade e Sair da plataforma. Em formulário alterado, a navegação solicita confirmação de descarte. A confirmação de identidade preserva o rascunho; após autenticar, repetir a ação explicitamente.

Na ficha da organização, Editar cadastro abre a aba Cadastro. As alterações de situação ficam em Resumo > Alterar situação da organização. Conferir o alcance indicado no diálogo antes de confirmar. Cancelar o diálogo não envia alteração.

Seletores de pessoa/organização fazem busca limitada e oferecem Mais resultados quando necessário. Selecionar o resultado e aplicar a consulta principal. Busca e filtros das listas de organizações, pessoas e convites ficam no endereço para recarga e compartilhamento interno; nunca incluir senhas ou tokens no endereço.
