# Roadmap: MVP manual até produto completo com IA

Sequência proposta, subordinada a gates de qualidade. Faixas de tempo são hipóteses de planejamento, não compromisso: assumem duas pessoas de desenvolvimento full stack, produto/operação disponíveis e apoio de QA; a partir de F3, especialista em visão computacional e acesso a provas/dados. Reestimar após cada gate. Pesquisa de IA e disponibilidade de eventos podem alterar fortemente as durações.

## F0 — Fundação e decisões • 1–2 semanas indicativas

F0 e F1 estão detalhadas em [sete sprints até o MVP](sprints/README.md). A distribuição inicial assume 1 semana de fundação e 11 semanas de implementação/validação, totalizando 12 semanas indicativas. O detalhamento amplia o teto anterior de F1 de 10 para 11 semanas para reservar o piloto final. Reestimar conforme capacidade; não há data de início definida.

Entregas: validar escopo, operação, números, acesso, conectividade e capacidade; escolher stack/provedor; preparar projeto, banco, CI e ambientes. Documentação deste diretório é o insumo, não a conclusão da fase.

Gate G0: D01–D04 resolvidas, responsáveis designados e primeira fatia vertical definida. Sem esse gate, iniciar apenas protótipos reversíveis.

## F1 — MVP manual completo • 6–11 semanas indicativas

Entregas: admin, organização, eventos, checkpoints, credenciais, teclado, captura, idempotência, fila local, revisão, auditoria, painel, exportação, infraestrutura e piloto. Backlog B1–B10.

Gate G1: requisitos P0 aceitos, falhas críticas zeradas, restore demonstrado e ensaio real com conciliação aprovada. IA ausente da implantação. Somando F0/F1: faixa revisada de 7–13 semanas até aceite, sujeita ao time e piloto; o plano inicial de sprints distribui 12 semanas dentro dessa faixa.

## F2 — Operação SaaS e resultados sem IA • 4–8 semanas indicativas

Entregas: onboarding de organizações, equipes e permissões refinadas; importação CSV validada; múltiplas modalidades/baterias; percurso com voltas e ocorrências explícitas; bruto/líquido/parciais/pace; regras e versões de resultados; rankings provisórios; customização básica; estudo de planos e cobrança. Cobrança real depende de decisão comercial.

Gate G2: pelo menos dois organizadores isolados no ensaio, cálculos verificados com casos conhecidos, circuitos sem confundir repetição com volta, operação manual estável. Continua possível operar 100% manualmente.

## F3 — Pesquisa e preparação de IA • 4–8 semanas indicativas

Entregas: consentimentos/autorizações e governança definidos pelos responsáveis; protocolo de filmagem, dataset rotulado, referência temporal, auditoria de licenças, benchmark de câmera/edge e contrato de ingestão/evidência. Comparar detector, tracking e OCR em condições reais.

Gate G3: dataset independente de teste por evento, relatório por cenário, custo/latência medidos e tecnologia candidata selecionada. Não há dependência de IA no núcleo operacional. Se leitura for insuficiente, revisar câmera, posição, números e modelo antes de avançar.

## F4 — IA na chegada, em paralelo à operação • 4–8 semanas indicativas

Entregas: uma câmera, linha virtual, tracking, OCR multiquadro, candidatos com evidência e fila humana; operação inicialmente em modo sombra, sem publicar resultado automático. Comparar com referência independente, mantendo fluxo manual.

Gate G4: atingir critérios acordados no plano de IA em eventos independentes, demonstrar falha/reconexão e revisão humana, estabelecer limites de iluminação/fluxo. Confiança do modelo isoladamente não libera produção.

## F5 — IA multiponto e operação híbrida • 6–10 semanas indicativas

Entregas: múltiplas câmeras/checkpoints, sincronização no edge, spool local, monitoramento de dispositivos, mapas, evidências antes/durante/depois, detecção de linha/direção, reconciliação manual/IA, modelos versionados, rollback e flags por evento.

Gate G5: carga e perda de rede ensaiadas; associação entre pontos sem misturar atletas; medir acurácia, latência e custo por checkpoint; fallback manual comprovado; nenhum pipeline pode sobrescrever correção humana validada.

## F6 — Experiência completa e lançamento ampliado • 6–12 semanas indicativas

Entregas: portal do atleta e experiência mobile; resultados e rankings ao vivo versionados; fotos/replay por número; certificados; APIs/webhooks de inscrição e resultados; notificações opt-in; painéis de transmissão; comercialização por evento/assinatura e personalização de marca.

Inteligência operacional: alertas de fluxo/anomalias e candidatos sem correspondência na inscrição, sempre com revisão e política clara. Não declarar fraude ou emergência apenas por inferência. Aplicativo nativo deve ter justificativa de uso/custo; portal responsivo é primeiro passo.

Gate G6: experiência ponta a ponta em evento real, políticas e licenças revisadas, suporte, custos, segurança e capacidade comercial aprovados. Funcionalidades comerciais precisam de critérios próprios de aceite antes de construção.

## O que significa finalizar este projeto

Versão completa inicial = G1 a G6 cumpridos; organizações isoladas; configuração e captura manual utilizáveis; captura automática validada no envelope operacional anunciado; auditoria visual e revisão; resultados/telemetria; portal, mídia e integrações priorizadas; operação, suporte e rollback documentados. Capacidades da apresentação não entregues precisam de adiamento explícito registrado, e não desaparecer do escopo.

Não existe garantia de acurácia universal. Finalização é um release com limites medidos, não fim de manutenção, treinamento ou melhoria dos modelos.

## Dependências e revisão

F0 → F1 → F2 → F3 → F4 → F5 → F6 é a sequência padrão. Preparação de dataset em F3 pode acontecer em paralelo a F2 somente após estabilizar G1, se houver equipe e autorização próprias; não antecipar IA no MVP.

A cada gate: demonstrar entrega, medir indicadores, atualizar riscos/custos, decidir avançar, corrigir ou reduzir escopo. Não somar as faixas e apresentar uma data final como certeza; os gates de IA dependem de evidência experimental.

## Atualização de escopo — 22/09/2026

Sprint 04 implementada conforme [registro de execução](sprints/sprint-04-execucao.md). RF-14/B8, cadastro mínimo de participantes (P1), foi adiado para F2 e não está concluído. O MVP manual continua aceitando números sem cadastro. A liberação operacional depende das Sprints 05 e 06.


## Atualização de escopo — 23/09/2026

Por solicitação do usuário, o cadastro de organizações e a gestão de contas pela plataforma são antecipados de F2 para antes do primeiro deploy e do piloto G1. O [plano do super admin](38-plano-implantacao-super-admin.md) detalha seis etapas adicionais, com MFA, convites, isolamento e auditoria. A estimativa anterior de F0/F1 não inclui esse acréscimo; replanejar a data de entrega. Cobrança, resultados avançados e IA permanecem nas fases futuras.
