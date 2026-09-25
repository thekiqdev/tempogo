# Painel mobile — cadastro orientado por tarefas

Entrega: 23/09/2026. Produto: TempoGo.

## Diagnóstico e decisão

A tela anterior usava abas horizontais que escondiam recursos no celular. O título e os metadados ocupavam boa parte da primeira tela, sem explicar o próximo passo de preparação. Os formulários apresentavam decisões técnicas sem contexto suficiente para quem organiza a primeira prova.

A nova organização começa pelo resumo do evento e apresenta uma ação principal conforme seu estado. O percurso, os acessos e a preparação aparecem como tarefas explicadas. Isso é uma hipótese de melhoria de usabilidade, ainda sujeita a validação com pessoas iniciantes.

## Implementado

- Resumo com próximo passo e atalhos para dados, percurso, equipe e preparação.
- Navegação inferior no celular: Resumo, Percurso, Equipe e Mais. Mais reúne passagens, configuração, recuperação e histórico. No desktop, as abas continuam disponíveis.
- Cadastro de evento em três etapas: identificação, data/local e conferência. Voltar entre etapas preserva o preenchimento.
- Distância em quilômetros, com vírgula ou ponto decimal e atalhos para distâncias comuns. A API continua recebendo metros inteiros.
- Fuso horário apresentado com nomes mais reconhecíveis, preservando o identificador técnico no envio.
- Cadastro de checkpoint com função explicada: largada, intermediário ou chegada; distância acumulada em km; ordem e pontos existentes para referência.
- Formulários focados no cadastro, com cancelamento explícito e confirmação para descartar alterações. Saídas pela conta e menu lateral ficam ocultas durante a edição. Recarregamento da página usa o aviso padrão do navegador quando há alterações.
- Bloqueio de envios simultâneos e reutilização do resultado salvo quando apenas a atualização da tela falha.
- Falha de carregamento do percurso tem mensagem e tentativa novamente; não é apresentada como percurso vazio.

A regra existente continua válida: pelo menos um checkpoint ativo para preparar o evento. O resumo não declara que a equipe está pronta sem verificar credenciais; orienta a conferência dos acessos.

## Verificação

- `npm run check`: lint, TypeScript, 10 testes unitários e build aprovados.
- `tests/e2e/sprint-01.mjs`: fluxo com API real local aprovado, incluindo login, criação de evento e três checkpoints, transições, auditoria e logout.
- `npm run test:e2e:admin-mobile`: teste de interface com API simulada local; cadastro completo, dados preservados ao voltar, confirmação de cancelamento, distâncias com vírgula, recuperação de falha no carregamento e quatro destinos visíveis em larguras de 320, 360, 390 e 430 px.
- Capturas do teste em `tmp/admin-mobile/`, com revisão visual do resumo e formulário. Não substituem testes com teclado e aparelhos físicos.

## Próxima validação com usuários

Pedir a pessoas sem treinamento que cadastrem uma prova, adicionem três pontos, configurem a equipe e encontrem o início da operação. Observar onde pedem ajuda, se entendem distância acumulada e ordem, e se encontram a ação seguinte. Testar Android e iPhone reais com teclado aberto, nomes longos e conexão instável.

Ainda não há rascunho persistente do cadastro após fechar o navegador. As ferramentas avançadas dentro de Equipe e Mais preservam os fluxos existentes; uma simplificação interna adicional deve partir dos resultados do piloto. A navegação administrativa ainda usa estado local, sem links diretos para cada seção.
