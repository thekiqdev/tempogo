# UX mobile — experiência de aplicativo

Data: 22/09/2026. Status: investigação do código e proposta para prototipação. Aplicação não alterada.

## 1. Objetivo, método e limites

Transformar o uso no celular em jornadas próprias de aplicativo: registrar rapidamente em campo, preparar uma prova e resolver pendências sem depender do computador. Isso envolve navegação, hierarquia, formulários, feedback e continuidade, além de aparência.

Foram inspecionadas todas as superfícies dos sete arquivos TSX de `apps/web/src`, CSS, armazenamento local, preparação PWA e documentação de negócio. O inventário inclui telas, formulários e estados dentro de uma mesma página.

**A investigação foi estática. Não houve navegação autenticada, medição de telas renderizadas ou teste com usuários.** Riscos de altura, alcance do polegar e sobreposição do teclado são hipóteses fundamentadas no código, a validar em aparelhos reais. Não são resultados de teste de usabilidade.

Neste documento, **atual** descreve código observado; **proposta** descreve o produto desejado; **validar** indica decisões e testes pendentes. Prioridades e metas são propostas, sem prazo fechado.

## 2. Diagnóstico

1. **A captura já tem teclado numérico próprio.** `Capture` usa visor editável com `inputMode="numeric"`, grade de 12 teclas e retorno de foco ao campo após salvar. O teclado do sistema pode disputar espaço com o teclado próprio. Cabeçalho, preparação offline, instruções e histórico compartilham a página.
2. **O administrativo mobile adapta a estrutura desktop.** O CSS empilha campos, transforma a sidebar em cabeçalho e permite rolagem horizontal de seis abas. Falta organizar a experiência pela tarefa do usuário.
3. **O contexto de navegação vive em estado React.** Evento, aba, edição e detalhe de revisão não têm endereço próprio. Voltar no navegador e retomar após recarga não acompanham automaticamente esses estados.
4. **Formulários competem com listas.** Revisão aparece após lista e paginação; formulário de checkpoint aparece dentro do percurso; Configuração reúne alteração de estado e conciliação.
5. **Já há uma base operacional importante.** Persistência local antes de limpar o número, UUID da intenção, sincronização e recuperação devem ser preservados. Uma interface mais simples precisa continuar distinguindo salvo no aparelho de confirmado no servidor.
6. **Existe PWA para captura.** Manifest e service worker têm escopo `/checkpoint`; isso não significa administração offline ou aplicativo publicado em lojas.

## 3. Princípios

- Uma ação principal por tela, com ações secundárias acessíveis por detalhes ou menu com texto.
- Número de peito, contexto do checkpoint e estado do registro têm prioridade durante a corrida.
- Navegação ao alcance da mão, retorno previsível e preservação de posição, filtros e preenchimento.
- Rede disponível não equivale a servidor acessível ou registro confirmado.
- Zeros à esquerda, horário original, isolamento de credenciais e auditoria são invariantes.
- Alertas operacionais continuam visíveis; textos técnicos extensos ficam em detalhes acionáveis.
- Melhorias mobile devem preservar a eficiência de consulta em desktop.

## 4. Navegação proposta

### Organizador

Fora do evento: lista de eventos, cabeçalho compacto com organização e menu da conta. Não criar destinos vazios apenas para compor uma barra inferior.

Dentro de um evento, propor quatro destinos inferiores com ícone e texto:

- **Resumo:** situação, próxima ação permitida, preparação e pendências.
- **Passagens:** consulta, filtros, detalhe e revisão.
- **Equipe:** checkpoints, acessos e comunicação dos aparelhos.
- **Mais:** dados do evento, recuperação, conciliação, exportação e histórico.

O Resumo fornece atalhos para as tarefas críticas, inclusive conciliação e encerramento. Organização e evento ativos devem permanecer identificáveis. Checkpoints continuam consultáveis durante a operação, com edição restrita ao estado permitido.

Rotas propostas, ainda não implementadas: `/eventos`, `/eventos/novo`, `/eventos/:id/resumo`, `/eventos/:id/passagens`, `/eventos/:id/passagens/:observationId`, `/eventos/:id/equipe` e subrotas para os outros fluxos. Filtros não sensíveis podem compor a URL; credenciais e tokens não.

### Operador

Três destinos: **Capturar**, **Registros** e **Aparelho**. Capturar é o destino principal; Registros concentra histórico/pendências; Aparelho concentra preparação, validade, relógio, recuperação e saída.

Inicialmente, destinos podem usar fragmentos sob `/checkpoint`, como `/checkpoint#registros`. O service worker atual só trata explicitamente a navegação offline para `/checkpoint`. Introduzir `/checkpoint/registros` exige também alterar e testar o fallback offline.

### Continuidade

Voltar recupera tela, filtros e posição anteriores. Formulários longos e revisões abrem em páginas; painéis inferiores ficam para filtros e ações curtas. Sair de um formulário alterado oferece continuar ou descartar. A troca entre destinos da captura não deve desmontar o serviço de sincronização ou reiniciar a fila.

## 5. Inventário completo

**P0:** integridade e operação de campo. **P1:** jornadas mobile completas. **P2:** conveniência após os fluxos principais. Cada item abaixo representa uma superfície ou subfluxo; não são 22 URLs existentes.

### M01 — Login administrativo e seleção de organização · P1

**Atual:** `Auth`, em [main.tsx](../apps/web/src/main.tsx), reúne login, recuperação, redefinição e seleção de organização. O mobile mantém uma faixa de marca acima do formulário.

**Proposta:** entrada compacta, preenchimento automático, mostrar senha e Entrar visível com teclado aberto. Múltiplas organizações viram etapa explícita de escolha após validar o acesso.

**Aceite:** erro preserva email; carregamento impede submissão duplicada; gerenciador de senhas e leitor de tela funcionam; troca de organização não mistura dados.

### M02 — Recuperar acesso e redefinir senha · P1

**Atual:** modos do mesmo `Auth`; redefinição recebe token pelo hash.

**Proposta:** telas com título e retorno claros, requisitos antes da senha e mensagem dedicada para link inválido/expirado. Confirmação de pedido não revela existência da conta.

**Aceite:** estado de erro oferece solicitar novo link; senha não fica em URL ou rascunho; feedback é anunciado e não apaga campos indevidamente.

### M03 — Lista de eventos, vazio e paginação · P1

**Atual:** `Dashboard`, 20 eventos por página, data, nome, local/modalidade e estado; sem busca/filtro na interface.

**Proposta:** cartões compactos e Novo evento como ação principal. Retorno preserva posição. Busca e filtros globais são evolução dependente da API; não filtrar só a página atual como se fosse todo o acervo.

**Aceite:** nomes longos cabem em 320 px sem rolagem lateral; distinguir ausência de eventos de erro; paginação preserva contexto.

### M04 — Criar e editar evento · P1

**Atual:** `EventForm`, com nome, data, fuso, local, modalidade e distância em metros. Salvar/Cancelar ao final; edição apresentada em rascunho.

**Proposta:** experimentar cadastro guiado em três etapas, detalhado na seção 7. Edição mantém grupos curtos. Preservar preenchimento ao voltar e ao receber erro.

**Aceite:** concluir integralmente pelo celular; teclado não cobre campo/ação; conflito de versão não substitui silenciosamente alteração de outro organizador.

### M05 — Detalhe e resumo do evento · P1

**Atual:** `Detail` abre em Checkpoints e possui seis abas: Checkpoints, Configuração, Acessos, Passagens, Recuperação e Histórico.

**Proposta:** resumo contextual: completar percurso no rascunho, conferir equipe quando pronto, acompanhar operação em andamento e conciliar após encerrar. Contagens precisam de fontes válidas; não exibir zero antes de carregar.

**Aceite:** todas as funções atuais permanecem acessíveis; troca de evento limpa contexto anterior; falha não parece ausência de pendências.

### M06 — Lista, criação e edição de checkpoints · P1

**Atual:** `CheckpointForm` e lista em `Detail`; nome, tipo, ordem, distância acumulada e ativo. Edição em rascunho.

**Proposta:** percurso sequencial com tipo/distância e formulário em página própria. Tipo com opções legíveis e prévia da posição. Reordenação futura precisa de alternativa Subir/Descer além de arrastar e validação do suporte transacional da API.

**Aceite:** preservar regras de sequência/estado; distinguir distância do evento de distância acumulada; erro mantém preenchimento; inativo tem rótulo textual.

### M07 — Emitir, consultar e revogar acessos · P1

**Atual:** [AccessPanel](../apps/web/src/capture-admin.tsx) reúne seletor de checkpoint, emissão, senha exibida uma vez e lista. Revogar chama a API diretamente.

**Proposta:** abrir emissão no checkpoint escolhido; recibo dedicado com Copiar código/Copiar senha e aviso da exibição única. Confirmar revogação mostrando aparelho e consequência. Compartilhar pelo sistema é melhoria P2, iniciada pelo usuário, com alternativa de cópia.

**Aceite:** só indicar cópia após sucesso; não incluir credenciais em URL/logs; distinguir ativo, expirado e revogado; validade identifica o fuso da entrada e da revisão.

### M08 — Passagens e filtros · P1

**Atual:** [ObservationPanel](../apps/web/src/management-panel.tsx), cinco filtros, atualização a cada 15 segundos, 50 itens por página e exportação.

**Proposta:** busca por número em destaque; filtros secundários em painel com Aplicar/Limpar e resumo dos filtros ativos. Item mostra número vigente, checkpoint, horário e situação; detalhe em página própria.

**Aceite:** retornar preserva filtros/posição; atualização não desloca leitura; distinguir captura de recebimento; dados desatualizados têm indicação.

### M09 — Detalhe e revisão de passagem · P1

**Atual:** detalhe depois da lista/paginação, com evidências, pedidos, formulário e histórico.

**Proposta:** página com original/vigente, evidências e pedidos antes da edição. Revisar abre formulário e apresenta alterações/consequências antes de salvar. Histórico expansível sem ocultar evidências necessárias.

**Aceite:** preservar zeros, precisão e fuso; conflito de versão/evidência pede releitura e preserva motivo; invalidar não apaga; voltar recupera consulta.

### M10 — Exportação CSV · P1

**Atual:** download filtrado em `ObservationPanel`, com avisos de zeros, UTC e caráter não oficial.

**Proposta:** ação secundária com resumo de evento/filtros e orientação para localizar arquivo no celular. Compartilhamento opcional conforme navegador.

**Aceite:** erro mantém filtros; download não é descrito como entrega a terceiros; preservar avisos e números como texto.

### M11 — Estado da prova, largada, encerramento e reabertura · P0

**Atual:** Configuração em `Detail` usa seletor de estado, horário real de largada, motivo e exceção de conciliação.

**Proposta:** ações pela tarefa: Preparar prova, Iniciar coleta, Encerrar coleta, Finalizar e Reabrir para conferência, quando permitidas. Confirmação informa efeito, horário/fuso e motivo. Horário real deve ser conferido; não assumir silenciosamente o instante em que a página abriu.

**Aceite:** servidor continua validando transições; bloquear ações concorrentes; pendências têm acesso à resolução; exceção de conciliação não dispensa revisão de passagens.

**Limite observado:** a interface oferece `draft → ready`, `ready → running/draft`, `running → closed`, `closed → running/finalized`, `finalized → closed`. Não inventar ação de arquivar só porque documentos de planejamento ou rótulos citam `archived`.

### M12 — Comunicação e situação dos aparelhos · P0

**Atual:** [RecoveryPanel](../apps/web/src/recovery-admin.tsx) mostra aparelhos, última comunicação, contagens e estado desconhecido.

**Proposta:** consulta em Equipe com detalhe do aparelho, contagens e orientação; manter acesso à recuperação.

**Aceite:** comunicação antiga/ausente significa desconhecido, nunca fila vazia; informar origem das contagens; atualização tem carregamento e erro.

### M13 — Importação de recuperação · P0

**Atual:** `RecoveryPanel` aceita JSON até 10 MB, valida envelope/evento e até 10 mil itens; envia lotes de 100 e informa progresso parcial; exige justificativa.

**Proposta:** Selecionar arquivo → Conferir pacote → Importar → Resultado. Prévia com quantidade/evento verificáveis; validação definitiva permanece no servidor. Distinguir recebidos para revisão de falhas e resultado parcial.

**Aceite:** seleção mobile funciona; pacote de outro evento não entra; repetir após falha preserva idempotência; importar não reativa credencial nem aprova passagens.

### M14 — Conciliação e preparação para finalizar · P0

**Atual:** `ReconciliationPanel` fica em Configuração; confirmação por aparelho e bloqueios conforme estado, comunicação e fila.

**Proposta:** checklist dedicado de encerramento, separando conciliados, desconhecidos e pendentes. Detalhe registra conferência. Finalizar segue regras do servidor.

**Aceite:** explicar bloqueio junto à ação; ausência de comunicação não vira sucesso; preservar justificativa em erro; atualizar resultado após resposta.

### M15 — Auditoria · P2

**Atual:** [AuditPanel](../apps/web/src/audit-panel.tsx), ação, autor, data, motivo, JSON expansível e páginas de 50 itens.

**Proposta:** linha do tempo com resumo legível e antes/depois quando disponíveis. Dados técnicos em Detalhes. Filtros novos dependem da API.

**Aceite:** sem rolagem horizontal; paginação acessível; não inventar identidade de autor; dados não mapeados continuam consultáveis.

### M16 — Login e renovação do operador · P0

**Atual:** `FieldApp`, em [field.tsx](../apps/web/src/field.tsx), recebe código alfanumérico e senha; entrada exige rede.

**Proposta:** entrada direta com mostrar senha; renovação explica uso do mesmo acesso para recuperar fila. Após autenticar, confirmar evento/checkpoint e seguir para preparação/captura.

**Aceite:** código permanece alfanumérico — teclado exclusivamente numérico é só para número de peito; troca de credencial não revela/envia fila anterior; erro preserva código sem armazenar senha.

### M17 — Preparar aparelho · P0

**Atual:** painel dentro da captura prepara cache, referência de relógio e concessão, com validade.

**Proposta:** preparação curta com resultado por etapa: acesso, armazenamento, offline e relógio. Depois, resumo compacto e detalhes em Aparelho. Não repetir tutorial a cada retomada.

**Aceite:** não afirmar Pronto para offline só porque há rede; falha oferece recuperação; respeitar concessão/acesso; testar em ambiente compilado HTTPS.

### M18 — Captura numérica · P0

**Atual:** `Capture` reúne visor, teclado, Registrar, preparação e histórico.

**Proposta:** tela dedicada descrita na seção 6.

**Aceite:** digitar/conferir/registrar sem percorrer conteúdo secundário; limpar apenas após persistência local; preservar identidade e horário nos retries; falha mantém visor.

### M19 — Registros do operador e sincronização · P0

**Atual:** histórico junto à captura, até 100 pendentes recentes e 100 recebidos, reenvio e atualização.

**Proposta:** Registros com contadores e filtros Todos/Pendentes/Atenção. Combinar visualmente registro local/remoto pela identidade da intenção, sem duplicar a mesma passagem.

**Aceite:** total não é calculado só pelos itens visíveis; exportar inclui todos os pendentes; envio não bloqueia digitação; estado não depende só de cor.

### M20 — Pedido de revisão pelo operador · P1

**Atual:** [ReviewRequest](../apps/web/src/review-request.tsx) abre formulário dentro do registro recebido.

**Proposta:** detalhe com número/horário e motivo, retorno explícito, preservação do texto em falha. Sem conexão, informar que ainda não foi enviado.

**Aceite:** sucesso só após resposta; preservar chave idempotente no retry; não simular fila offline de pedidos, inexistente hoje; operador não altera/apaga observação.

### M21 — Recuperação local, saída e troca de acesso · P0

**Atual:** exportação JSON no histórico; logout bloqueado com pendências; após exportação existe alternativa para trocar acesso.

**Proposta:** centralizar em Aparelho: contagem, sincronização e exportação. Distinguir arquivo gerado de pacote efetivamente guardado pelo usuário. Exportar não equivale a confirmar recebimento.

**Aceite:** fila permanece isolada/preservada; acesso bloqueado permite recuperação; atualização/logout não limpam armazenamento; testar cancelamento do salvamento/compartilhamento.

### M22 — Inicialização, sessão expirada e falhas globais · P0

**Atual:** `App` e `FieldApp` carregam sessão; administração reage à expiração; campo recupera preparação local quando possível.

**Proposta:** estados distintos para carregar, rede/servidor indisponível, acesso expirado e falha de armazenamento. Tentar novamente/Renovar acesso conforme causa.

**Aceite:** falha de API não parece lista vazia; não deixar carregamento sem saída; retomada não mistura organizações/credenciais; não prometer administração offline.

## 6. Tela dedicada de captura

### Hierarquia, de cima para baixo

1. Cabeçalho compacto com checkpoint e evento, abrindo detalhes do contexto.
2. Faixa com condição real da captura e total pendente; alertas críticos têm prioridade.
3. Visor grande, número como texto com zeros preservados; instrução curta quando vazio.
4. Teclado 3 × 4: `1–9`, `Limpar`, `0`, `Apagar`.
5. Ação **Registrar passagem**.
6. Feedback em espaço estável: “00152 salvo no aparelho” ou “00152 confirmado no servidor”.
7. Navegação Capturar / Registros / Aparelho.

Histórico completo, preparação detalhada e ajuda extensa ficam fora do espaço principal. Contexto e impedimentos continuam visíveis sem trocar de tela.

### Comportamento

- Teclado próprio como padrão mobile; visor não abre automaticamente outro teclado. Manter alternativa explícita de digitação pelo sistema e suporte a teclado físico/leitor de tela. Não usar só largura para eliminar acessibilidade.
- Aceitar 1 a 8 dígitos sem conversão numérica. `00152` e `152` continuam distintos.
- No limite, manter conteúdo e informar; Apagar remove último; Limpar age só sobre o que ainda não foi registrado.
- Registrar desabilitado quando vazio, inválido ou sem autorização; impedimento operacional tem explicação próxima.
- Congelar horário na confirmação, persistindo UUID, número e horário da mesma intenção antes do envio.
- Bloquear repetição da submissão durante gravação local; permitir próximo registro intencional do mesmo número. Duplicidade suspeita não implica descarte.
- Limpar visor apenas após persistência local. Falha: “Não registrado. Tente novamente”, mantendo o número.
- Rede não interrompe próxima digitação. Resposta tardia identifica o número correspondente, sem substituir feedback por outro indistinguível.
- Nenhum modal por passagem; som/vibração opcionais, sempre acompanhados de feedback visual/acessível.

### Estados a desenhar

Pronto vazio/preenchido; gravando; salvo pendente; enviando; confirmado; offline preparado; offline sem concessão; relógio incerto; captura pausada/encerrada; concessão expirada; acesso bloqueado; item bloqueado; armazenamento indisponível; retomada após minimizar/recarga/outra aba.

**Meta proposta:** visor, teclas e Registrar sem rolagem em 360 × 640 CSS px, fonte padrão e sem aviso expandido. Com ampliação, paisagem ou alertas longos, permitir rolagem em vez de esconder ações ou reduzir alvos. Validar área útil com barras do navegador.

## 7. Cadastro de evento no celular

### Etapa 1 — Identificação

Nome e modalidade. Manter Corrida de rua como sugestão editável e informar escopo atual de modalidade única, sem voltas. Ação Continuar.

### Etapa 2 — Quando e onde

Data, local, fuso com nome amigável e distância opcional com unidade explícita. Sugerir o fuso padrão atual, sem trocá-lo silenciosamente pelo do aparelho. Atalhos de 5 km/10 km podem reduzir digitação.

Se a interface usar km, converter para metros inteiros ao enviar, validando vírgula decimal e limites do contrato. Testar `5`, `5,5`, `0,001`, vazio e fora da faixa. Vazio não vira zero; não arredondar sem informar.

### Etapa 3 — Conferir e criar

Resumo dos seis campos, com Editar por grupo. **Criar evento** envia e abre Resumo em rascunho com **Adicionar checkpoints** como próximo passo. Não marcar evento como pronto automaticamente.

### Continuidade

- Estado único entre etapas; Voltar não apaga valores.
- Distinguir rascunho do formulário neste aparelho de evento em rascunho salvo no servidor. Persistência local é nova capacidade, isolada por usuário/organização e com descarte explícito.
- Sem rede, manter campos e não anunciar criação concluída.
- Bloquear duplo toque não resolve resposta perdida após criação no servidor. Antes de retry automático, definir idempotência ou reconciliação da criação no backend.
- Após expiração da sessão, revalidar usuário/organização antes de restaurar rascunho.
- Obrigatórios/opcionais explícitos, erro junto ao campo e foco no primeiro problema.
- Ações não cobrem teclado nem último campo; formulário rola naturalmente.

**Validar:** comparar três etapas com formulário único curto. Medir conclusão, retorno entre campos e esforço; mais etapas não são automaticamente melhores.

## 8. Sistema visual e acessibilidade

Componentes propostos: cabeçalho mobile, navegação inferior, barra de ação, campo com ajuda/erro, seletor de contexto, cartão de passagem/aparelho, status de sincronização, confirmação crítica e painel de filtros. Teclado/visor são específicos de campo.

- Manter identidade verde/escura existente com menos painéis aninhados e hierarquia clara.
- Meta interna: alvos de 48 × 48 CSS px; teclas de captura preferencialmente 56–64 px quando couberem. São metas do produto.
- Corpo inicial de formulário de 16 px; visor com algarismos tabulares e espaço para 8 dígitos; espaçamento consistente.
- Prever safe areas, altura dinâmica, barras do navegador e teclado; não cortar conteúdo em altura fixa.
- Estados com texto além de cor, foco visível, rótulos reais, ordem de leitura e retorno de foco de painéis.
- Sucesso anunciado sem roubar foco; erros críticos destacados; não reler toda fila a cada atualização.
- Suportar ampliação e redução de movimento; gestos não são único caminho.

O mínimo de alvo WCAG 2.2 trata de 24 × 24 CSS px e exceções de espaçamento. As metas maiores acima são uma decisão para uso em campo, não a afirmação desse mínimo. Referência: [W3C — Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).

## 9. Caminho para aplicativo futuro

### Web/PWA primeiro

Separar apresentação de armazenamento, relógio, sessão e fila, preservando contratos. Testar navegador e instalado, atualização com pendências e retomada offline. O manifest atual inicia em `/checkpoint` e oferece SVG; verificar ícones/instalação por plataforma antes de prometer suporte. Instalação varia por navegador/sistema: [web.dev — Installation](https://web.dev/learn/pwa/installation).

Não ampliar automaticamente cache para administração: definir política de sessão, dados sensíveis e leitura offline. Preparação atual usa shell compilado; desenvolvimento com HMR não valida esse fluxo.

### Distribuição futura

PWA, empacotamento web e interface nativa são alternativas após o piloto. Aparência de aplicativo não resolve sozinha ciclo de vida, armazenamento, permissões ou distribuição. Decidir com base em necessidade comprovada de câmera, integrações, segundo plano e lojas.

Contratos, validações e domínio são candidatos diretos ao reuso. DOM/CSS e IndexedDB podem precisar de adaptação/substituição em interface nativa.

### Invariantes

Preservar UUID e horário; não descartar fila em atualização/logout/troca de tela; manter isolamento; não ativar atualização forçada em operação; conservar a precaução atual de não usar `skipWaiting` automaticamente. Não depender de sincronização com tela bloqueada/app fechado. Offline mostra última situação conhecida, sem fingir conhecimento imediato de encerramento remoto.

## 10. Backlog e dependências

A sequência executável, com entregas, dependências e critérios de liberação, está em [Etapas de implantação mobile](34-etapas-implantacao-mobile.md). Os lotes abaixo são a origem do backlog; o documento 34 detalha sua execução.

### Lote A — Protótipo e fundação

- **UX-01 · P0:** protótipo Capturar/Registros/Aparelho com estados críticos. Validar teclado, polegar, 8 dígitos e interrupções.
- **UX-02 · P1:** navegação e componentes compartilhados; aceite inclui voltar/preservar contexto.
- **UX-03 · P0:** separar ciclo da fila do ciclo das telas. Regressão de captura/offline e troca de destino durante envio.

### Lote B — Campo

- **UX-04 · P0:** captura dedicada e teclado único por modo. Depende de UX-01/03.
- **UX-05 · P0:** preparação, registros e recuperação próprios. Depende de UX-02/03; exportar todos os pendentes.
- **UX-06 · P1:** detalhe e pedido de revisão. Depende de UX-05; preservar rede/idempotência.

### Lote C — Preparação administrativa

- **UX-07 · P1:** login, organização e eventos. Depende de UX-02.
- **UX-08 · P1:** cadastro, edição e rascunho. Depende de UX-02/07; retry de criação e persistência exigem decisão técnica.
- **UX-09 · P1:** checkpoints e acessos. Depende de UX-08; validar fuso e revogação.

### Lote D — Gestão

- **UX-10 · P1:** consulta, filtros, detalhe/revisão e exportação. Depende de UX-02; novas buscas globais podem exigir API.
- **UX-11 · P0:** resumo operacional, transições, aparelhos, recuperação e conciliação. Depende dos atalhos de resolução de UX-09/10. Não liberar redesign administrativo sem os fluxos críticos completos.
- **UX-12 · P2:** auditoria legível, compartilhamento opcional e conveniências.

### Lote E — Validação

- **UX-13 · P0:** ensaio de campo, acessibilidade e regressão offline/desktop antes da liberação.
- **UX-14 · P2:** decidir distribuição do app com base no piloto; não bloqueia melhoria mobile web.

Não há estimativa fechada antes de validar protótipo, contratos e dispositivos-alvo.

## 11. Validação e critérios de liberação

### Dispositivos e layout

Testar larguras de 320, 360, 390 e 430 CSS px; incluir 360 × 640, paisagem, texto a 200%, teclado aberto e nomes longos. Regressão em tablet/desktop. Em aparelhos reais: Safari/iPhone e Chrome/Android, navegador e instalado quando disponível. Registrar modelo, sistema, navegador e área útil; emulação não comprova comportamento real de teclado/offline.

### Tarefas de usabilidade

Piloto proposto: três organizadores e cinco operadores, incluindo iniciantes; avaliação qualitativa, não estatística. Comparar interface atual e protótipo com tarefas equivalentes:

1. Entrar, confirmar checkpoint e preparar aparelho.
2. Registrar 20 números incluindo zeros, 8 dígitos, correção prévia e repetição intencional.
3. Perder rede, distinguir pendente de confirmado e retomar envio.
4. Enfrentar falha de armazenamento e acesso expirado sem assumir registro inexistente.
5. Localizar registro e solicitar revisão.
6. Criar evento, checkpoints e acesso só pelo celular.
7. Filtrar/revisar passagem e voltar à mesma posição.
8. Recuperar pacote com falha parcial, conciliar e finalizar conforme regras.

Medir tempo, erros de digitação, toques indevidos, ajuda e compreensão dos estados. Metas propostas: nenhuma perda no ensaio; todos distinguem salvo localmente/confirmado; ao menos quatro de cinco operadores completam sequência sem ajuda; os três organizadores concluem cadastro básico sem assistência. Medir referência antes de definir redução percentual de tempo.

### Regressão técnica na implementação

- Zeros, inválidos, limite, teclado físico e tecnologia assistiva.
- Double tap, Enter mantido, retry de mesmo UUID e repetição humana.
- Persistência local falha mantém visor; rede lenta não bloqueia captura.
- Offline preparado, concessão expirada, renovação e troca de credencial.
- Recarga, minimizar/retomar, duas abas e atualização com fila pendente.
- Exportação integral, reimportação e falha após parte dos lotes.
- Conflito de versão/evidência, transições e aparelho sem comunicação.
- Cadastro com teclado aberto, volta, perda de rede e resposta perdida após salvar.
- Voltar do navegador, URL direta e fallback offline das rotas.
- Leitor de tela, foco, contraste medido, ampliação e barras fixas.

Usar `tests/e2e` e documentos 24–29 como base da regressão futura. Esta entrega documental não executou testes da aplicação.

## 12. Decisões para o primeiro protótipo

Propor captura dedicada, Registros/Aparelho separados, cadastro em três etapas e navegação contextual por evento; manter administração dependente de conexão nesta fase. Validar antes de fechar componentes e cronograma.

Em aberto: aparelhos mínimos, mão dominante, uso sob sol, comparação cadastro guiado/formulário único, retenção de rascunhos, retry seguro da criação e necessidade real de lojas.

## 13. Rastreabilidade

- [main.tsx](../apps/web/src/main.tsx): `Auth` (43), `EventForm` (215), `CheckpointForm` (339), `Detail` (443), `Dashboard` (700), `App` (871). Linhas da investigação, sujeitas a mudanças.
- [field.tsx](../apps/web/src/field.tsx): `FieldApp` (28), `Capture` (153), captura (391), exportação (444), logout (487), visor/teclado (561/574).
- [management-panel.tsx](../apps/web/src/management-panel.tsx): passagens, revisão, exportação e conciliação.
- [capture-admin.tsx](../apps/web/src/capture-admin.tsx), [recovery-admin.tsx](../apps/web/src/recovery-admin.tsx), [audit-panel.tsx](../apps/web/src/audit-panel.tsx), [review-request.tsx](../apps/web/src/review-request.tsx): demais superfícies inventariadas.
- [style.css](../apps/web/src/style.css): breakpoints 640, 750 e 850 px, estilos de captura e formulários.
- [field-store.ts](../apps/web/src/field-store.ts), [field-pwa.ts](../apps/web/src/field-pwa.ts), [vite.config.ts](../apps/web/vite.config.ts), [manifest](../apps/web/public/manifest.webmanifest): persistência, preparação e limites da PWA.
- [Jornadas](06-jornadas-e-interface.md), [captura](24-captura-manual-e-acessos.md), [offline](26-offline-e-recuperacao.md) e [gestão](28-painel-revisao-e-conciliacao.md): continuidade com documentação existente. Planejamento antigo não é tratado como funcionalidade já implementada.

