# Reestruturação visual e de navegação do painel TempoGo

Data: 28/09/2026. Status: etapas 1 e 2 implementadas localmente; etapas 3 a 5 pendentes.
Escopo: painel do superadmin em /plataforma. Entrega local; sem publicação ou envio ao GitHub.
Referências: capturas fornecidas do painel e referência visual de gerenciador de arquivos. Este plano complementa a entrega 50; preserva o cadastro em etapas na própria página.

## Objetivo

Dar ao painel aparência de aplicativo administrativo consistente e reduzir o esforço de localizar, cadastrar e administrar organizações e acessos. A ação principal deve estar evidente, o contexto deve permanecer visível e os campos essenciais devem aproveitar a área disponível.

“Caber na tela” significa priorizar a tarefa e manter suas ações acessíveis. Não significa comprimir texto, ocultar campos por overflow ou proibir rolagem. Conteúdo longo, erros, teclado virtual e zoom precisam continuar acessíveis.

## Diagnóstico do estado atual

- A lateral usa largura fixa de 240 px, sem modo recolhido. O cabeçalho tem altura mínima de 74 px; o conteúdo acrescenta 32 px acima e títulos com margens largas.
- O mesmo contexto aparece no cabeçalho, breadcrumb, título da página, título do cartão e parágrafos introdutórios. O formulário começa tarde na tela.
- A regra genérica .crm-content form coloca filtros e cadastros em grade sem definir colunas. Em Super admins, email, situação e busca de organização ocupam grandes faixas verticais antes do primeiro resultado.
- Botões de largura total e cartões dentro de cartões dão o mesmo peso a ações principais, filtros e informações secundárias.
- Há estilos acumulados no style.css, com regras genéricas sobre label, form e button. Ajustes pontuais podem afetar áreas que não deveriam mudar.
- Na captura do cadastro, a mensagem “Etapa 1 concluída” aparece junto da etapa 1 vazia. O código de newOrg limpa erros, mas não limpa notice. Revisar também navegação e carregamento para impedir mensagens e respostas antigas em outra tela.
- O fluxo em duas etapas, a ativação automática, o cadastro direto de superadmin e os diálogos de gestão já existem. São comportamentos a preservar.

Arquivos principais: apps/web/src/platform-workspace.tsx, platform-organizations.tsx, organization-members.tsx, platform-accounts.tsx, platform-overview.tsx, platform-invitations.tsx, platform-sheet.tsx e style.css.

## Direção visual

Usar da referência a separação entre navegação e conteúdo, as superfícies claras, listas alinhadas e ações bem posicionadas. Não copiar o azul, as letras muito pequenas, o fundo decorativo ou a moldura externa: eles retirariam espaço útil.

Paleta inicial baseada no painel atual:
- Azul petróleo #10222E para navegação e estrutura.
- Verde #0F6151 para a ação principal.
- Turquesa #69D4C1 para detalhes e destaque sobre fundo escuro.
- Fundo neutro #F3F5F7, superfícies brancas e texto #202F3E.
- Estados com texto e ícone além da cor; validar contraste antes de consolidar os tokens.

A aparência tecnológica virá do alinhamento, ícones consistentes, estados de interação, indicadores discretos e tipografia bem definida. Evitar excesso de gradientes, contornos, sombras e cartões decorativos.

Escala proposta: títulos de 22–24 px, texto de 14–16 px, espaçamentos de 8/12/16/24 px, cantos de 10–14 px. Controles de toque com pelo menos 44 px; inputs mobile com fonte de 16 px. Esses valores serão validados visualmente, não aplicados indiscriminadamente.

## Estrutura de navegação

Desktop:
- Lateral de aproximadamente 224 px; modo recolhido de 72 px com ícones, nomes acessíveis e dicas no foco/hover.
- Logo compacto, navegação principal e conta/ambiente na base. Área de navegação pode rolar em janelas baixas, sem perder acesso ao rodapé.
- Visão geral, Organizações e Superadmins em primeiro plano. Convites e Auditoria em grupo secundário de administração, sem remover suas rotas.
- Barra superior de aproximadamente 56 px: controle da lateral, contexto atual e conta. Título e ação principal em uma única linha da página; breadcrumb apenas em níveis internos.
- Conteúdo com largura fluida e limite de leitura. Não esticar formulários curtos até a largura inteira de monitores grandes.
- Preferir rolagem vertical da página com cabeçalho e ações aderentes. Evitar página, cartão e formulário rolando simultaneamente.

Tablet e celular:
- Lateral vira menu sobreposto, com fechamento por Escape, foco contido e retorno ao botão Menu.
- Cabeçalho compacto. Nenhuma barra inferior nova nesta etapa: evitar duplicar navegação.
- Campos em uma coluna; filtros adicionais recolhidos; listas adaptadas em linhas/cartões compactos.
- Ações aderentes respeitam área segura e teclado. Se o teclado ou zoom reduzir a altura, o rodapé deve voltar ao fluxo ou permitir acesso sem cobrir campos.

## Organização das telas

### Visão geral

Resumo compacto com indicadores úteis já disponíveis e pendências acionáveis. Atalhos para criar organização e acessar cadastros incompletos. Evitar gráficos meramente decorativos e contagens fictícias. Auditoria recente fica em lista secundária.

### Organizações: lista e ficha

Cabeçalho com título e Nova organização. Barra única de busca e situação; filtros avançados recolhidos. Desktop com linhas alinhadas para nome, responsável, situação e ação de abrir. Mobile mostra os mesmos dados em blocos compactos. Clique no nome/linha abre a ficha sem depender de descobrir um menu de três pontos.

Na ficha: nome e situação no topo; seções Usuários, Dados, Configurações e Histórico com espaçamento uniforme. Convites ficam como opção secundária. Mostrar a consequência de uma ação perigosa no momento da ação, não como um aviso extenso permanente.

### Cadastro da organização

Manter as duas etapas na mesma página, sem popup:
1. Organização: nome e email como campos principais. Telefone e observações em Dados adicionais recolhidos. No desktop, usar duas colunas quando os campos permitirem.
2. Responsável: email e senha; confirmação de senha ao lado no desktop e abaixo no mobile. Criar conta é o caminho inicial; Vincular conta existente fica como alternativa explícita. Orientação de senha curta e próxima dos campos.

Usar um indicador de etapas compacto e uma barra de ações consistente: Voltar e Continuar / Concluir e ativar. Ao concluir, substituir o formulário pela ficha ativa e mensagem de sucesso. Ao retornar aos dados, preservar a organização criada; ao iniciar outro cadastro, limpar avisos do anterior. Erros ficam junto dos campos, preservando o preenchimento.

### Superadmins

Título único com Novo superadmin. Busca por email e situação na mesma barra. O filtro por organização sai da área principal, pois não é necessário para o caso comum de gestão de administradores globais; manter em filtros avançados se útil.

Lista com email, situação e MFA legíveis. Cadastro direto com email e senha preservado. Convites antigos permanecem recolhidos. A ficha agrupa acesso, sessões e operações sensíveis; confirmação adicional, quando exigida, acontece no contexto da operação.

### Convites e auditoria

Filtros essenciais na primeira linha; opções adicionais recolhidas. Resultados com hierarquia, paginação/carregar mais e estados de carregamento/erro. Detalhes extensos e conteúdo técnico aparecem somente quando solicitados. Não eliminar informações necessárias à investigação.

### Ações de gestão

Preservar diálogos para ações curtas como trocar senha e alterar email. Cabeçalho e identificação da conta visíveis; erros no próprio formulário; confirmação de descarte; retorno do foco ao acionador. Cadastro inicial do responsável continua inline. Ações secundárias ficam em Mais opções, mantendo os comandos comuns à vista.

## Etapas de implantação

### 1. Base visual e estrutura do painel

Criar tokens de cores, tipografia e espaçamento e estilos limitados ao painel da plataforma. Implementar lateral recolhível, cabeçalho compacto e um padrão de título/ação. Consolidar regras antigas em vez de acrescentar uma nova camada de sobrescritas.

Aceite: todas as rotas atuais continuam acessíveis; lateral utilizável em janelas baixas; menu e modo recolhido têm rótulos e foco; sem alteração no organizador ou no checkpoint.

### 2. Cadastro guiado com melhor aproveitamento da tela

Reduzir introduções e títulos repetidos, reorganizar campos e dados opcionais, criar barra de ações e limpar mensagens ao trocar de tarefa. Preservar avanço, retorno, retomada e ativação automática.

Aceite: os campos essenciais de cada etapa e a ação principal ficam visíveis em 1366×768, a 100% de zoom, no estado normal. Com campos opcionais, erros ou teclado, rolagem permanece permitida. Nenhum dado é perdido ao corrigir validação; nenhum popup na etapa 2.

### 3. Organizações e Superadmins

Aplicar barras de filtros compactas, listas alinhadas, cabeçalhos únicos e fichas por grupos de tarefas. Manter cadastro direto e ações contextuais.

Aceite: em 1366×768, título, ação principal, filtros essenciais e primeiros resultados aparecem sem rolagem inicial. Criar, localizar e abrir uma conta não exige expandir filtros avançados.

### 4. Visão geral, convites e auditoria

Uniformizar as telas restantes, estados vazios, carregamento, sucesso e erro. Revisar atalhos e hierarquia das informações.

Aceite: componentes equivalentes têm aparência e comportamento consistentes. Paginação, filtros e links continuam funcionando; avisos não migram para outra tarefa.

### 5. Validação visual e funcional

Capturar e revisar as telas em 1366×768, 1440×900, 1024×768, 390×844 e 360×800; incluir altura reduzida de 600 px, zoom de 200% e teclado virtual. Checar foco, contraste, nomes longos, mensagens de erro e ausência de rolagem horizontal.

Executar lint, tipos e build, a jornada de organizações e a regressão do painel. Confirmar criação → responsável → organização ativa, cadastro de superadmin → MFA, filtros, diálogos, proteção de preenchimento e operações de suspensão. Testes de banco adicionais apenas se houver mudança de regras ou contratos.

Aceite: nenhuma ação essencial inacessível por corte/overflow, nenhum campo coberto pelo rodapé, nenhuma alteração de permissões ou fluxo de autenticação causada pela revisão visual.

## Limites e sequência recomendada

Começar pela estrutura e imediatamente aplicar ao cadastro de organização: essa combinação demonstra o ganho no problema mostrado nas capturas. Depois ampliar para listas e demais telas. O plano não requer novas migrations nem alteração de regras de negócio; eventuais necessidades descobertas devem ser registradas separadamente.

## Etapa 1 — entrega local em 28/09/2026

Base visual implementada em platform-workspace.tsx, platform-icons.tsx e style.css:
- Lateral de 224 px, recolhível para 72 px; preferência salva localmente com fallback quando armazenamento não está disponível.
- Rótulos acessíveis e dicas no foco/hover em modo recolhido; destaque de rota e separação dos itens secundários.
- Cabeçalho aderente de 56 px, controle da lateral, contexto e conta com avatar. Breadcrumb apenas em rotas internas e padrão de título de página sem margens excessivas.
- Menu mobile com fundo clicável para fechar, Escape, foco contido e restauração ao botão Menu. O menu é fechado automaticamente ao voltar para a largura desktop, evitando conteúdo bloqueado.
- Rolagem da navegação independente do rodapé para janelas baixas; tokens de cores, dimensões e espaçamento; estilos de botões, campos e foco restritos à plataforma. Regras antigas conflitantes da estrutura foram consolidadas.

Validação: lint aprovado, TypeScript e build do frontend aprovados, jornada test:e2e:organizations aprovada. Cobertura de navegação por todas as seções com teclado, persistência após reload, largura recolhida, menu em 390×600, troca mobile/desktop, cadastro guiado, ativação, senha e cadastro direto de superadmin. Capturas revisadas em tmp/organization-admin/shell-expanded.png, shell-collapsed.png e shell-mobile-menu.png.

A etapa 1 não reorganiza ainda os campos nem os filtros de cada tela: esse trabalho pertence às etapas 2 e 3. Sem alteração de backend, migração ou publicação nesta etapa.

## Etapa 2 — entrega local em 28/09/2026

Cadastro com largura máxima de 960 px, indicador compacto e menos avisos repetidos. Nome e email em duas colunas no desktop; telefone e observações em Dados adicionais, inicialmente recolhidos quando vazios. Dados opcionais já preenchidos continuam visíveis ao editar.

Na etapa do responsável, tipo de acesso/email e senha/confirmação usam duas colunas no desktop. Orientação de senha curta, formulário inline sem cartão aninhado e barra única para Voltar e Concluir. No celular, os campos usam uma coluna. A barra de ações fica aderente quando há altura suficiente e retorna ao fluxo em telas baixas ou durante edição em mobile, evitando cobrir campos com o teclado.

Mensagens são limpas ao navegar/iniciar outro cadastro; avisos redundantes entre as etapas foram removidos. Ativação automática, vínculo de conta existente, retorno e retomada permanecem. Ações mostram Salvando durante envio.

Validação: build/TypeScript e lint; jornada real de organizações com retorno, retomada, dados opcionais e correção de senhas divergentes. Campos essenciais e botão de conclusão integralmente visíveis em 1366×768, a 100%, com testes de viewport; revisão visual das duas etapas. Mobile 360/390 px sem rolagem horizontal. Nenhuma alteração de backend ou migration; sem publicação.

## Lista de organizações — entrega local

Lista convertida em tabela compacta com organização, contato, responsável, situação e ações na mesma linha em desktop. Ações: Usuários (Continuar quando incompleta), Editar e Configurar. Nova organização está no cabeçalho da lista. Busca por nome, situação e limpar filtros ficam em uma barra única.

Paginação real usando o cursor da API existente, com Anterior/Próxima, número da página e quantidade exibida. Tamanhos de 10, 25 e 50; alterar busca ou tamanho reinicia a primeira página. A navegação entre páginas usa os filtros aplicados, sem aplicar silenciosamente o texto ainda não pesquisado. Não há contagem total fictícia.

Validação: build/TypeScript, lint e jornada de navegador com 12 organizações isoladas de teste, avanço/retorno, filtro, limpeza, alteração de tamanho e atalho de edição. Jornada de cadastro, ativação, senha e superadmin preservada. A parte de Superadmins da etapa 3 permanece pendente. Sem publicação.

## Ficha da organização e publicação autorizada

Linha da organização clicável em qualquer coluna, com Enter/Espaço e foco visível. Botões individuais preservam suas ações sem disparar a abertura da linha. Ficha com identificação, contato e navegação agrupados. Usuários organizados por identidade/função, situação do acesso e ações; busca compacta e adaptação para celular. A barra de ações do cadastro permanece no fluxo no mobile para evitar deslocamento ao fechar o teclado.

Publicação no GitHub autorizada pelo usuário nesta entrega, incluindo as melhorias locais acumuladas e migration 011. Um deploy precisa aplicar npm run migrate antes de utilizar cadastro e redefinição de senha; ambientes com setup automático já aplicam as migrations. Arquivos de ambiente, capturas e PDF de referência não fazem parte do commit.
