# Implantação da experiência mobile — plano por etapas

Data: 22/09/2026. Status: primeira entrega de campo implementada em homologação local; validação técnica registrada, piloto humano pendente. Ver [execução da primeira entrega](35-primeira-entrega-mobile.md). As caixas abaixo só devem ser fechadas conforme todos os critérios de cada tarefa forem atendidos.

Base: [investigação de UX mobile](33-ux-mobile-experiencia-app.md). Este plano transforma os lotes daquele documento em incrementos implementáveis, com dependências, entregas e critérios de liberação. Os códigos M01–M22 identificam telas/subfluxos e UX-01–UX-14 identificam itens do backlog original.

A numeração abaixo é específica da evolução mobile e não renumera as Sprints 00–06 do MVP. Não há prazo fechado sem validar protótipo, capacidade da equipe e aparelhos do piloto. Testes acompanham cada etapa; a validação final não substitui os testes dos incrementos.

## Sequência de implantação

1. Validar fluxos e protótipos.
2. Preparar estrutura visual e navegação.
3. Implementar captura dedicada.
4. Completar a operação de campo e liberar piloto de captura.
5. Implementar entrada administrativa e cadastro de eventos.
6. Completar preparação da prova e acessos da equipe.
7. Implementar gestão, revisão e encerramento.
8. Validar e liberar a experiência mobile completa.
9. Avaliar distribuição como aplicativo.

A primeira entrega funcional para uso controlado é o conjunto das etapas 1–4. A experiência administrativa completa é liberada após as etapas 5–8. A etapa 9 é uma decisão posterior e não bloqueia o mobile web.

## Etapa 1 — Validar fluxos e protótipos

**Objetivo:** resolver a organização das tarefas antes de alterar a interface em produção.

**Dependências:** acesso a ambiente de teste e dados fictícios para observar o comportamento atual. A investigação inicial foi pelo código; navegação autenticada ainda precisa ser realizada.

**Escopo:** UX-01 e decisões de UX-02/UX-08; validar o mapa M01–M22.

**Tarefas:**

- [ ] Navegar por todas as telas atuais em viewport mobile e registrar problemas reproduzíveis.
- [ ] Prototipar Capturar, Registros e Aparelho, incluindo falhas e estados offline.
- [ ] Prototipar cadastro guiado e comparar com formulário único curto.
- [ ] Prototipar Resumo, Passagens, Equipe e Mais dentro do evento.
- [ ] Definir comportamento de Voltar, teclado, barras fixas, foco e preservação de contexto.
- [ ] Definir aparelhos do piloto, critérios visuais e tarefas de usabilidade.
- [ ] Registrar decisões sobre rascunhos, conversão km/metros e retry de criação de evento.

**Entrega:** protótipo navegável, mapa de navegação e registro das decisões, com estados críticos representados.

**Critério para avançar:** tarefas principais demonstráveis sem caminhos sem saída; captura e cadastro possuem critérios de aceite verificáveis. Hipóteses não validadas ficam explícitas.

**Implantação:** somente artefatos e demonstração; sem alteração operacional.

## Etapa 2 — Preparar estrutura visual e navegação

**Objetivo:** criar a base reutilizável das telas mobile.

**Dependência:** etapa 1.

**Escopo:** UX-02/UX-03; estrutura transversal e M22.

**Tarefas:**

- [ ] Criar cabeçalho mobile, navegação inferior, barras de ação e campos com ajuda/erro.
- [ ] Definir tipografia, espaçamento, alvos de toque e estados de interação.
- [ ] Tratar safe areas, teclado e altura útil sem cortar conteúdo.
- [ ] Implementar navegação com retorno e preservação de contexto.
- [ ] Separar apresentação da captura do ciclo de fila, sessão e sincronização.
- [ ] Manter destinos de campo sob `/checkpoint` com fragmentos, ou implementar/testar fallback offline se forem criadas subrotas.
- [ ] Isolar a ativação da nova experiência de campo e da administrativa; o mecanismo de ativação é novo trabalho, não funcionalidade presumida.
- [ ] Verificar coexistência com desktop e compatibilidade com os dados já armazenados.

**Entrega:** estrutura de navegação e componentes prontos para receber os fluxos, disponíveis em homologação.

**Critério para avançar:** trocar tela não reinicia nem perde fila; Voltar funciona; foco e navegação por teclado são previsíveis; não há regressão dos fluxos existentes.

**Implantação:** homologação. Não expor navegação com destinos incompletos aos operadores.

## Etapa 3 — Implementar captura dedicada

**Objetivo:** tornar digitar, conferir e registrar a tarefa central da tela.

**Dependência:** etapa 2.

**Escopo:** UX-04; M18 e estados de captura de M22.

**Tarefas:**

- [ ] Implementar visor amplo e teclado próprio com 1–9, Limpar, 0 e Apagar.
- [ ] Evitar abertura simultânea do teclado do sistema, mantendo alternativa acessível de digitação.
- [ ] Manter checkpoint, evento e condição de captura visíveis de forma compacta.
- [ ] Priorizar Registrar e feedback vinculado ao número correto.
- [ ] Validar 1–8 dígitos e preservar zeros à esquerda.
- [ ] Limpar somente após persistência local; falha mantém o número digitado.
- [ ] Proteger contra submissão repetida sem bloquear próxima captura por lentidão da rede.
- [ ] Verificar visor, teclas e Registrar em 360 × 640 com fonte padrão; permitir rolagem quando necessária por acessibilidade/alertas.

**Entrega:** captura mobile dedicada em homologação.

**Critério para avançar:** cenários de double tap, Enter mantido, zeros, limite, armazenamento indisponível e rede lenta passam; confirmação local e remota não se confundem; UUID e horário sobrevivem ao retry.

**Implantação:** homologação, ainda vinculada à conclusão da operação de campo na etapa 4.

## Etapa 4 — Completar campo, offline e recuperação

**Objetivo:** oferecer toda a jornada do operador sem depender da tela antiga para tarefas críticas.

**Dependência:** etapa 3.

**Escopo:** UX-05/UX-06 e primeira validação UX-13; M16, M17, M19, M20, M21 e estados de campo de M22.

**Tarefas:**

- [ ] Adaptar login, confirmação de checkpoint e renovação do mesmo acesso.
- [ ] Implementar Aparelho com preparação, validade, relógio e erros acionáveis.
- [ ] Implementar Registros com contadores, pendentes, confirmados e itens que exigem atenção.
- [ ] Unificar representação local/remota da mesma intenção sem duplicar visualmente passagens.
- [ ] Manter sincronização e exportação de todos os pendentes, inclusive fora da lista visível.
- [ ] Implementar detalhe e pedido de revisão, preservando a exigência de conexão atual.
- [ ] Adaptar recuperação, saída e troca de acesso mantendo isolamento da fila.
- [ ] Testar build HTTPS offline, recarga, retomada, duas abas e atualização com pendências.
- [ ] Executar piloto controlado de captura com operadores e dados/evento de teste identificados.

**Entrega:** experiência completa Capturar / Registros / Aparelho.

**Critério de liberação:** nenhuma perda nos cenários ensaiados; operadores distinguem salvo localmente/confirmado; acesso expirado ou trocado não mistura filas; exportação/reimportação preservam registros. Aplicar os critérios de usabilidade do documento 33.

**Implantação:** primeiro marco liberável. Ativar para um grupo controlado de aparelhos preparados antes da operação. Expandir após observar o piloto. Não trocar versão durante a coleta com fila pendente.

## Etapa 5 — Entrada administrativa e cadastro de eventos

**Objetivo:** permitir criar e editar um evento confortavelmente pelo celular.

**Dependências:** etapa 2 e decisão de fluxo da etapa 1. Na sequência principal, executar após estabilizar a entrega de campo.

**Escopo:** UX-07/UX-08; M01, M02, M03, M04 e estados administrativos de M22.

**Tarefas:**

- [ ] Adaptar login, escolha de organização, recuperação e redefinição de senha.
- [ ] Implementar lista de eventos, estados vazios, erros e paginação mobile.
- [ ] Implementar cadastro conforme fluxo validado, com revisão dos dados antes de criar.
- [ ] Preservar preenchimento entre etapas e em falhas de rede/validação.
- [ ] Implementar edição com tratamento de conflito de versão.
- [ ] Se adotado, converter km para metros com validação de vírgula decimal e limites.
- [ ] Definir e implementar política de rascunho local por usuário/organização, sem armazenar senha/token.
- [ ] Resolver resposta perdida na criação antes de oferecer retry automático: idempotência ou reconciliação verificável no backend.
- [ ] Testar teclado aberto, retorno, sessão expirada e organização diferente na retomada.

**Entrega:** cadastro e edição completos em homologação.

**Critério para avançar:** criação integral pelo celular; nenhum campo se perde ao voltar; falha não é anunciada como sucesso; retry não produz duplicação silenciosa; edição mantém regras do evento.

**Implantação:** homologação administrativa; não substituir toda a administração antes de completar etapas 6 e 7.

## Etapa 6 — Preparação da prova e equipe

**Objetivo:** conectar o cadastro à configuração do percurso e distribuição de acessos.

**Dependência:** etapa 5.

**Escopo:** UX-09 e parte de UX-11; M05, M06, M07 e M12.

**Tarefas:**

- [ ] Implementar Resumo do evento e navegação contextual completa.
- [ ] Implementar lista sequencial e formulários próprios de checkpoints.
- [ ] Respeitar edição somente nos estados permitidos.
- [ ] Implementar emissão de acesso por aparelho e recibo de credencial exibida uma única vez.
- [ ] Implementar cópia com confirmação real e revogação com contexto/consequência.
- [ ] Mostrar validade com fuso explícito.
- [ ] Integrar comunicação dos aparelhos, última atualização e situação desconhecida.
- [ ] Preservar acesso às funções administrativas ainda em adaptação, sem links sem destino.

**Entrega:** preparação pelo celular, do evento ao acesso do operador.

**Critério para avançar:** cadastrar evento, checkpoints e credenciais sem computador; dados de outro evento não permanecem na troca de contexto; aparelho sem comunicação não aparece como fila vazia.

**Implantação:** homologação integrada; compartilhamento nativo e reordenação por gesto podem ficar fora desta etapa sem impedir a jornada principal.

## Etapa 7 — Gestão, revisão e encerramento

**Objetivo:** concluir a operação administrativa mobile, incluindo contingência e fechamento.

**Dependência:** etapa 6.

**Escopo:** UX-10, restante de UX-11 e auditoria de UX-12; M08, M09, M10, M11, M13, M14 e M15.

**Tarefas:**

- [ ] Implementar consulta de passagens, filtros e retorno à mesma posição.
- [ ] Abrir detalhe/revisão em página própria com original, vigente e evidências.
- [ ] Tratar conflitos de versão/evidência preservando motivo digitado.
- [ ] Adaptar exportação CSV com resumo dos filtros e orientação mobile.
- [ ] Implementar ações nomeadas de preparar, iniciar, encerrar, finalizar e reabrir conforme permissões existentes.
- [ ] Conferir horário real da largada e fuso antes de confirmar.
- [ ] Implementar recuperação: selecionar, conferir, importar e apresentar resultado parcial/final.
- [ ] Implementar conciliação por aparelho e pendências que impedem finalização.
- [ ] Tornar auditoria legível no celular, mantendo detalhes técnicos acessíveis.
- [ ] Validar jornada integrada: preparar → capturar → encerrar → recuperar/revisar → conciliar → exportar/finalizar.

**Entrega:** todas as funções atuais cobertas pela nova experiência mobile.

**Critério para avançar:** nenhuma ação contorna validações do servidor; falha parcial é recuperável; importação não aprova automaticamente; ausência de comunicação não vira conciliação; invalidar não apaga o original.

**Implantação:** versão candidata em homologação. Conveniências P2, como compartilhar arquivos pelo sistema e novos filtros de auditoria, podem seguir depois sem retirar funções já existentes.

## Etapa 8 — Validar e liberar o mobile completo

**Objetivo:** comprovar a jornada integrada em aparelhos reais e liberar de forma gradual.

**Dependências:** etapas 4 e 7.

**Escopo:** UX-13 completo e verificação transversal de M01–M22.

**Tarefas:**

- [ ] Executar tarefas do piloto com três organizadores e cinco operadores, conforme plano do documento 33.
- [ ] Testar Safari/iPhone e Chrome/Android, navegador e instalado quando disponível.
- [ ] Validar 320–430 px, paisagem, teclado aberto, texto ampliado, leitor de tela e foco.
- [ ] Executar regressões de desktop, captura, offline, recuperação, revisão e transições.
- [ ] Testar atualização/retomada com fila e compatibilidade entre versões.
- [ ] Registrar problemas por impacto, corrigir bloqueadores e repetir apenas cenários afetados e regressões necessárias.
- [ ] Preparar orientação curta para operadores e organizadores sobre novos destinos e estados.
- [ ] Registrar versão candidata, evidências, limitações e procedimento de retorno.
- [ ] Liberar primeiro para grupo controlado, acompanhar e expandir após os critérios passarem.

**Entrega:** experiência mobile liberada e documentação de operação atualizada.

**Critério de conclusão:** todos os fluxos M01–M22 verificados; nenhum defeito aberto que cause perda/mistura de registros, impeça recuperação ou bloqueie tarefa essencial; metas de compreensão e conclusão do piloto atendidas. Tempos devem ser comparados com a referência medida, sem inventar percentuais de melhoria.

**Implantação:** fora de coleta ativa. Avaliar erros de persistência/sincronização, crescimento de pendências, falhas de formulário e necessidade de ajuda. Métricas devem evitar credenciais e dados desnecessários.

## Etapa 9 — Avaliar distribuição como aplicativo

**Objetivo:** decidir a forma de distribuição a partir do uso real da experiência mobile.

**Dependência:** etapa 8 estabilizada.

**Escopo:** UX-14; melhorias PWA e escolha de distribuição futura.

**Tarefas:**

- [ ] Verificar instalação, ícones, abertura e atualização da PWA nos aparelhos-alvo.
- [ ] Identificar necessidades reais de câmera, integração, segundo plano e lojas.
- [ ] Comparar manter PWA, empacotar a web ou construir interface nativa.
- [ ] Mapear reuso de contratos/domínio e adaptações de armazenamento e ciclo de vida.
- [ ] Registrar decisão, custo estimado, limitações e novo plano de implementação.

**Entrega:** decisão de arquitetura/distribuição e backlog específico. A publicação em lojas é um projeto posterior, não resultado automático desta etapa.

**Critério de conclusão:** alternativa justificada por requisitos do piloto; continuidade da fila, atualização e recuperação contempladas.

## Marcos de entrega

- **Marco 1 — Base validada:** etapas 1–2; protótipo e fundação em homologação.
- **Marco 2 — Operador mobile:** etapas 3–4; primeira entrega funcional para piloto controlado.
- **Marco 3 — Administração mobile completa:** etapas 5–7; versão candidata com preparação, gestão e fechamento.
- **Marco 4 — Liberação ampliada:** etapa 8; evidências de uso real e regressão.
- **Marco 5 — Evolução para app:** etapa 9; decisão e planejamento de distribuição.

## Regras de implantação e retorno

1. Antes de cada liberação, registrar versão anterior/nova, escopo ativado, cenários testados e responsáveis pela operação e verificação.
2. Preservar formato dos registros locais na primeira evolução visual sempre que possível. Se houver migração, validar compatibilidade e retorno antes de liberar; restaurar só o frontend pode não ser seguro.
3. Não usar limpeza de IndexedDB, cache ou dados do navegador como estratégia de retorno com registros pendentes.
4. Havendo problema que comprometa captura, impedir novas operações afetadas e preservar/exportar a fila; decidir retorno após confirmar compatibilidade da versão anterior com os dados presentes.
5. Não forçar recarga ou ativação de service worker durante coleta. Uma versão disponível não implica atualização segura naquele momento.
6. Isolar a liberação de campo da administrativa permite entregar o operador primeiro sem trocar o painel de todos os organizadores.
7. Manter administração dependente de conexão nesta iniciativa. Operação administrativa offline exige requisitos e implementação próprios.

## Registro de execução por etapa

Ao iniciar uma etapa, registrar responsável, data e pendências. Ao terminar, preencher:

- Alterações implementadas e vínculo com M/UX.
- Evidências de homologação e dispositivos utilizados.
- Testes executados e resultados, incluindo falhas remanescentes.
- Versão liberada, público de liberação e limitações.
- Critério de avanço atendido ou motivo para não liberar.
- Procedimento de retorno validado e compatibilidade dos dados.

As caixas deste documento permanecem abertas até existir evidência de execução. A divisão em etapas é planejamento, não indicação de funcionalidades já implantadas.

