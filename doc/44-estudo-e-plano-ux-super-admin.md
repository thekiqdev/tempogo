# TempoGo — estudo e plano de reorganização do super admin

Data: 24/09/2026. Status: UX-SA-01 a UX-SA-06 implementadas localmente; homologação e limites registrados na execução UX-SA-06.

## Objetivo

Transformar a administração da plataforma em um painel com organização de CRM: localizar uma organização, compreender sua situação, consultar seus responsáveis e executar uma ação com clareza. Manter a identidade visual do painel do organizador e as regras de segurança já entregues nas SA-01 a SA-06.

Neste plano, CRM significa gestão organizada de organizações, pessoas e acessos. Não inclui funil de vendas, cobrança, assinaturas, campanhas, chat, automação comercial, impersonação ou IA. O cadastro existente de observações administrativas será aproveitado; não será criado um sistema de atendimento nesta atualização.

A sequência proposta tem **seis etapas UX-SA-01 a UX-SA-06**. São etapas novas de experiência e apresentação, sem renumerar sprints ou etapas anteriores. O plano original foi implementado. Os registros de execução abaixo descrevem as entregas, decisões e limites de validação.

## Base do estudo e limites

Inspecionados os componentes platform.tsx, platform-organizations.tsx, platform-accounts.tsx, platform-overview.tsx, main.tsx, event-overview.tsx e style.css; conferidos contratos de leitura em platform-management.ts, platform-accounts.ts e platform-overview.ts.

A comparação visual usa capturas reais das jornadas sintéticas de homologação de 24/09/2026, não um protótipo inventado nem uma conta real. As capturas mostram uma jornada específica; totais, emails e situações nela são dados de teste. Não foi realizado teste de usabilidade com usuários humanos. Os problemas abaixo são achados de inspeção; metas de facilidade serão verificadas na etapa final.

Referências preservadas:

- [Super admin atual — captura completa](assets/estudo-super-admin/plataforma-atual.png).
- [Painel do organizador — referência visual](assets/estudo-super-admin/organizador-referencia.png).

## Diagnóstico: o que precisa melhorar

### 1. Página única extensa — prioridade alta

platform.tsx monta visão geral, organizações, contas e auditoria simultaneamente. O menu apenas aponta para âncoras. Ao abrir um cadastro, seus formulários alongam ainda mais a mesma página. A captura de desktop desta jornada tem 6.716 px de altura; é uma medida da captura, não de toda sessão possível.

Impacto: o usuário precisa procurar seções pela rolagem, perde a referência da organização selecionada e tem dificuldade para retornar à lista. Proposta: páginas próprias, menu persistente e detalhe por entidade. Carregar dados somente da área ativa.

### 2. Aparência de formulário de acesso após o login — prioridade alta

O cartão central de autenticação continua ocupando o topo do painel. A gestão usa um bloco com largura máxima de 1.000 px e cartões aninhados; o painel do organizador já utiliza uma estrutura com lateral escura, barra superior, título contextual e conteúdo principal.

Proposta: manter cartão central apenas nos fluxos públicos de login/MFA/recuperação. Após autenticar, abrir a estrutura administrativa. Nome da conta, estado de segurança e saída ficam no menu de conta, com aviso discreto de confirmação recente quando necessário.

### 3. Organizações apresentadas como lista simples — prioridade alta

A listagem mostra poucos dados de comparação e o detalhe editável aparece abaixo da lista. Cadastro, convites, responsabilidade e suspensão dividem o mesmo formulário visual.

Proposta: listagem em tabela no desktop e cartões compactos no celular, com nome, contato, situação, responsável e ação Abrir. Ficha da organização com abas: Resumo, Cadastro, Pessoas e acessos, Convites e Histórico. Suspensão/encerramento ficam em uma área de ações sensíveis, separada de Salvar cadastro.

### 4. Contas e super admins misturados — prioridade alta

Pesquisa de pessoas, vínculos, bloqueio global, recuperação, troca de email e convite de super admin estão na mesma seção. Motivo é compartilhado por ações diferentes. Estados internos como active/invited podem aparecer sem tradução.

Proposta: área Pessoas e acessos com filtros claros, visão dedicada de super admins e ficha da pessoa. Pedir motivo no diálogo da ação escolhida. Exibir separadamente identidade global, vínculo organizacional e privilégio da plataforma; usar rótulos em português sem esconder diferenças.

### 5. Auditoria exige conhecimento técnico — prioridade média

O filtro pede UUID de ator/organização e ação exata. O detalhe mostra JSON diretamente. Isso atende investigação técnica, mas dificulta o uso cotidiano.

Proposta: seletores pesquisáveis por nome/email, catálogo de ações com rótulos, atalhos de período e descrição legível das mudanças conhecidas. IDs, request ID e JSON permanecem em Detalhes técnicos, preservando o valor para suporte. Ações desconhecidas devem continuar visíveis pelo código original.

### 6. Indicadores ainda não orientam uma decisão — prioridade média

Há contagens, mas poucas ligações diretas com a tarefa seguinte. A API atual de falhas de email conta falhas finais históricas; esse número não equivale a convites que ainda precisam de ação. Não há total global de provas em andamento na resposta de overview: esse dado está nas métricas por organização.

Proposta: resumo compacto com atalhos para listas filtradas, atividades recentes e pendências comprovadas. Não apresentar gráficos de crescimento, receita, disponibilidade ou indicadores globais que o backend não fornece. Falhas históricas devem ser identificadas como históricas até existir consulta de pendências atuais.

### 7. Carregamento, retorno e mobilidade — prioridade média

A composição atual pode mostrar lista vazia enquanto uma consulta inicial ainda está em andamento. Os componentes preservam alguns rascunhos durante reautenticação, mas não há navegação por páginas com histórico/filtros próprios. No celular, a ausência de uma estrutura de navegação torna a rolagem especialmente longa.

Proposta: estados distintos de carregamento, vazio, sem resultado e erro; voltar preservando filtros; navegação móvel acessível; formulários de uma coluna; foco e mensagens ligados à ação executada.

## Direção visual: aproveitar o organizador

Reutilizar a linguagem existente: marca TempoGo, lateral azul-escura, fundo cinza-claro, superfícies brancas, texto escuro e verde como ação principal. Preservar a família Inter/Segoe UI existente, títulos contextuais, badges, separadores sutis, espaçamento e botões com foco visível. Extrair variáveis/componentes compartilhados apenas onde houver benefício real; não reescrever o painel do organizador para acomodar o super admin.

Desktop: menu lateral com área ativa, barra superior com contexto e conta, título/breadcrumb e uma ação principal por página. Formulários de leitura confortável, sem esticar todos os campos pela largura inteira. Dados de comparação podem aproveitar uma área mais ampla.

Celular: cabeçalho compacto e menu recolhível com foco controlado; página continua identificada ao fechar o menu. Tabelas viram cartões quando possível. Não reduzir fonte para forçar colunas nem esconder ações essenciais em rolagem horizontal. Área de toque de pelo menos 44 px como meta do projeto; contraste e foco serão verificados na implementação.

Não copiar literalmente o menu de eventos do organizador: super admin gerencia organizações e pessoas, não cronometragem.

## Arquitetura de navegação proposta

- /plataforma: Visão geral.
- /plataforma/organizacoes: listagem e criação.
- /plataforma/organizacoes/:id: ficha, com aba em parâmetro de URL.
- /plataforma/pessoas: contas e vínculos.
- /plataforma/pessoas/:id: ficha da pessoa.
- /plataforma/super-admins: visão filtrada de privilégios globais, reutilizando a gestão de pessoas.
- /plataforma/convites: central de convites organizacionais e globais.
- /plataforma/auditoria: histórico administrativo.

Conta, MFA e saída no menu do usuário. Não criar uma área genérica Configurações sem recursos concretos para configurá-la.

As rotas são proposta a consolidar em UX-SA-01. Acesso direto, atualização e Voltar/Avançar devem funcionar. Preservar os links públicos atuais com fragmentos reset, mfa-reset, invite, super-invite e email-change; tokens não entram em parâmetros de busca, logs, analytics ou breadcrumbs. Confirmar o fallback de SPA no frontend e no proxy de produção.

### Jornada central

Entrar e validar MFA → Visão geral → Organizações → buscar/filtrar → abrir ficha → consultar responsável/convites → escolher ação → confirmar identidade se necessário → revisar impacto e confirmar → ver resultado e histórico.

Exemplo de suspensão: abrir organização → Ações da organização → Suspender → ver organização e provas em andamento → informar motivo e confirmar impacto → reautenticar se necessário, preservando rascunho → confirmar a operação. Reautenticar não deve executar automaticamente uma ação sensível que o usuário ainda precisa revisar.

## Ajustes de API necessários

Evitar carregar todas as páginas para filtrar no navegador ou fazer uma chamada de detalhe para cada linha da tabela.

1. Organizações: hoje pesquisa por nome, filtra situação e pagina por UUID. Acrescentar resposta resumida do responsável e pesquisa por contato se aprovadas em UX-SA-01. Sem coluna de ordenação clicável até existir ordenação correspondente no servidor. Se adicionar ordenação por nome/data, mudar cursor de maneira compatível e testar empates.
2. Pessoas: hoje há email/situação global; acrescentar filtros por organização e privilégio para a visão Super admins. Paginar vínculos da ficha, hoje retornados juntos sem paginação. Nome de pessoa não existe no cadastro atual: exibir email, sem inventar campo obrigatório.
3. Convites: organizacionais exigem organization_id; globais usam endpoint separado. A central requer consulta global paginada, com tipo, organização, destinatário, situação efetiva e entrega. Definir validade e expiração no servidor; preservar os endpoints de mutação já existentes. Falha de entrega e situação do convite são conceitos diferentes.
4. Auditoria: reutilizar filtros e cursor existentes. Seletores pesquisáveis usam consultas limitadas de organizações/pessoas; filtros por ação usam catálogo de códigos conhecidos. Não depender de leitura de todo o histórico.
5. Visão geral: manter os totais existentes e consultar atividade recente de modo limitado. Criar pendências atuais somente se houver critério verificável: por exemplo convite ainda válido/pendente cuja entrega mais recente falhou, não todas as falhas antigas. Não incluir provas em andamento como total global sem implementar agregação segura e testada.

Novas consultas continuam exigindo sessão MFA e RLS quando acessarem dados de provas. Não conceder BYPASSRLS, escrita de passagens ou novos poderes para melhorar a apresentação. Preferir mudanças aditivas; migration nova somente se comprovadamente necessária, sem editar 001–010.

## Plano de implementação em seis etapas

### UX-SA-01 — Estrutura, jornadas e desenho das telas

Dependência: este estudo. Entregas: mapa de navegação definitivo, esboços desktop/mobile de lista/ficha, componentes e contratos de leitura necessários. Cobrir login, página inicial, organização, pessoa, convite e confirmação sensível. Consolidar rótulos e dados reais disponíveis.

Aceite: cada tarefa atual tem destino definido; criação, suspensão, convite, troca de email e recuperação têm fluxo completo; links públicos e confirmação MFA têm tratamento explícito. Não deixar botões para funções inexistentes. Registrar decisões antes de codificar a estrutura.

### UX-SA-02 — Estrutura visual e navegação

Dependência: UX-SA-01. Entregas: lateral, cabeçalho, menu de conta, rotas, breadcrumbs, estados de carregamento/erro e componentes de formulário, badges, listagem e diálogo. Separar interface de autenticação da interface autenticada. Montar somente a página ativa; preservar rascunhos ao confirmar identidade e avisar antes de descartar alteração não salva.

Aceite: links diretos, reload e histórico funcionam; menu móvel abre/fecha por teclado; foco retorna ao acionador; não há regressão de login/MFA ou vazamento de estilos no organizador/operador. Todas as funções existentes continuam alcançáveis durante a transição.

### UX-SA-03 — Organizações como centro da administração

Dependência: UX-SA-02. Entregas: tabela/cartões, busca, filtro, paginação e criação guiada com revisão antes de enviar convite. Ficha em abas, leitura inicial e edição explícita; responsáveis, membros, convites, indicadores e histórico contextual. Ajustar apenas as consultas necessárias para exibir os dados da lista.

Aceite: criar organização, aceitar convite, localizar cadastro, editar, transferir responsabilidade, suspender e reativar mantêm as regras anteriores. Voltar restaura busca/filtro. A listagem funciona com mais de uma página sem chamadas de detalhe por linha. Organização encerrada apresenta limitações com clareza.

### UX-SA-04 — Pessoas, super admins e central de convites

Dependência: UX-SA-03. Entregas: listas/fichas de pessoas, visão de super admins, vínculos paginados e central de convites com filtros de tipo/situação/organização. Ações sensíveis em diálogos próprios com motivo, alcance e impacto; preservar versões, idempotência e confirmação recente.

Aceite: o usuário distingue bloqueio global de bloqueio de vínculo; convite de super admin continua exigindo aceite e MFA; troca de email continua exigindo prova do endereço/senha. Último admin protegido inclusive sob concorrência. Convites reenviados/cancelados/expirados e falhas de entrega têm estados coerentes; reautenticação não perde formulário.

### UX-SA-05 — Visão geral e auditoria orientadas a tarefas

Dependência: UX-SA-04. Entregas: resumo enxuto, atalhos com filtros, pendências atuais quando sustentadas pela API, atividade recente e auditoria legível com seletores pesquisáveis e detalhes técnicos recolhidos.

Aceite: todo indicador identifica o que conta e leva a uma consulta coerente; não há números fictícios nem filtros aplicados só à página carregada. Auditoria mantém ordenação/cursor, período fixo ao paginar, request ID e histórico imutável. Contagens históricas não são tratadas como incidentes atuais.

### UX-SA-06 — Usabilidade, acessibilidade e regressão

Dependência: UX-SA-01 a 05. Entregas: ensaios automatizados, inspeção visual e roteiro de validação humana; atualização dos manuais e nova candidata quando aprovada tecnicamente.

Verificar desktop 1280/1440 px, tablet e celular 360/390 px; zoom 200%, teclado, ordem de foco, diálogos, contraste, rótulos, mensagens e ausência de rolagem horizontal da página. Usar fixtures com várias páginas de organizações/contas/convites, textos longos, estados diferentes, erro de rede, 401/403/409/429 e sessão expirada.

Repetir login/MFA, onboarding, bloqueios, transferência, recuperação, suspensão offline/reconexão, revisão/CSV e isolamento entre painéis. Conferir também os links públicos antigos. Não fazer teste destrutivo em cadastro real.

Metas de usabilidade a verificar: chegar à lista de organizações em uma ação de navegação; abrir a ficha a partir do resultado em uma ação; distinguir com clareza o alcance de bloqueios; concluir tarefas sem consultar UUID ou depender da conversa com o desenvolvedor. Medir erros e pontos de dúvida no ensaio humano, sem declarar aprovação humana a partir de automação.

Aceite: verificações técnicas aprovadas, jornadas principais acessíveis e documentação compatível. Registrar separadamente qualquer validação humana/aparelho físico ainda pendente. Não reutilizar o manifesto anterior como evidência de uma interface que foi modificada.

## Ordem, estimativa e controle da execução

Executar UX-SA-01 → 02 → 03 → 04 → 05 → 06. Cada etapa terá registro em doc/sprints/ux-sa-NN-execucao.md quando iniciada, com escopo, decisões, mudanças, testes e pendências. Só marcar concluída após os critérios, sem antecipar checks neste planejamento.

Estimativa inicial para uma pessoa: 1–2 dias para desenho; 2–3 para estrutura; 2–3 para organizações; 2–4 para pessoas/convites; 1–2 para visão geral/auditoria; 2–3 para validação. Total de referência: 10–17 dias úteis, sujeito aos ajustes de contratos e ao retorno dos testes; não é prazo contratado nem estimativa de duração desta sessão.

Marcos: após UX-SA-02, identidade visual e navegação estabelecidas; após UX-SA-04, administração cotidiana reorganizada; após UX-SA-06, candidata verificada. Os testes SA anteriores servem de base de regressão, não de aceite automático da nova interface.

## Fora do escopo e cuidados de compatibilidade

Sem exclusão física, permissões personalizadas, ações críticas em lote, importação em massa, busca global universal, edição de passagens pelo super admin, sistema comercial ou gráficos sem dados. Essas expansões exigem planejamento próprio.

Preservar MFA, CSRF, autorização do backend, limite de tentativas, versões, auditoria transacional, RLS, revogação, idempotência e fila offline. Confirmar que filtros/rotas não transportam senhas ou tokens. A identidade visual pode ser compartilhada; sessões e escopos de acesso continuam separados.

Referências: [plano funcional SA](38-plano-implantacao-super-admin.md), [manual atual](42-manual-super-admin.md), [deploy atual](43-atualizacao-super-admin-deploy.md) e [índice de sprints](sprints/README.md).

## Registros da implementação

- [UX-SA-01 — execução](sprints/ux-sa-01-execucao.md).
- [UX-SA-02 — execução](sprints/ux-sa-02-execucao.md).
- [UX-SA-03 — execução](sprints/ux-sa-03-execucao.md).
- [UX-SA-04 — execução](sprints/ux-sa-04-execucao.md).
- [UX-SA-05 — execução](sprints/ux-sa-05-execucao.md).
- [UX-SA-06 — execução](sprints/ux-sa-06-execucao.md).

O aceite é técnico e local. A validação humana em aparelhos reais e a publicação na VPS permanecem etapas de operação, conforme o guia 43. O estudo acima é mantido como referência do diagnóstico anterior.
