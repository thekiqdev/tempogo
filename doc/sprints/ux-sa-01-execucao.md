# UX-SA-01 — Estrutura e jornadas

Data: 24/09/2026. Concluída como especificação para implementação.

Estrutura definida: lateral TempoGo/Administração com Visão geral, Organizações, Pessoas, Super admins, Convites e Auditoria; cabeçalho contextual e conta. Autenticação mantém sua tela pública. Conteúdo autenticado ocupa a área de trabalho, sem cartão de login no topo.

Lista de organizações: título/ação Nova organização, pesquisa e situação, linhas com nome/contato/responsável/situação, Abrir e paginação. Ficha: título/nome/situação, retorno à lista, abas Resumo, Cadastro, Pessoas e acessos, Convites e Histórico. Desktop prioriza comparação; celular usa uma coluna e navegação recolhível.

Pessoas: pesquisa por email, filtros e lista; detalhe separa identidade, vínculos e segurança. Super admins é uma visão da mesma fonte de contas filtrada no servidor. Central de convites inclui tipo, destinatário, organização, situação e entrega, com mutações existentes.

Rotas seguem o plano 44; busca/situação/aba ficam na URL, tokens públicos continuam em fragmentos consumidos na entrada. Não usar hash de navegação para competir com tokens. Voltar/Avançar/reload devem funcionar. A implantação será incremental e manterá os controles existentes até sua substituição.

Ações sensíveis: abrir ação no contexto → informar motivo/impacto → confirmar identidade se expirada → retornar ao mesmo rascunho → confirmar explicitamente. Não executar mutação automaticamente após reautenticação. Preservar versões e chave de idempotência em repetição da mesma solicitação.

Contratos necessários: resumo do responsável na organização; filtro de privilégio nas contas; convites globais paginados com tipo; vínculos paginados e seletores de auditoria. Implementar junto à etapa correspondente, sem permissões novas sobre passagens.

Este registro documenta a especificação anterior à implementação. As etapas seguintes foram executadas; consultar [UX-SA-06](ux-sa-06-execucao.md) para evidências e limites. Não representa aceite humano de usabilidade.
