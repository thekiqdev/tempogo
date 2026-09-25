# Riscos, premissas e decisões pendentes

As perguntas abaixo não impedem criar esta documentação. Algumas precisam ser respondidas antes de fechar a implementação ou operar um evento. Papéis são responsáveis sugeridos, ainda sem pessoas designadas.

## Decisões antes do desenvolvimento principal

- **D01 — Formato do primeiro piloto.** Produto/organizador: corrida sem voltas e uma distância é suficiente? Há largada em ondas? Proposta atual: modalidade única, sem voltas. Afeta modelo, regras e G0.
- **D02 — Identificação.** Organizador: número numérico de até oito dígitos, zeros significativos e ausência de cadastro permitida? Proposta: sim. Afeta teclado, unicidade e importação.
- **D03 — Operação e rede.** Coordenação: quantos checkpoints, aparelhos e atletas; quanto tempo sem rede; quem opera cada aparelho? Proposta: limites de ensaio do PRD e credencial por dispositivo dentro do ponto. Afeta offline e dimensionamento.
- **D04 — Equipe e stack.** Liderança: experiência, disponibilidade, orçamento e hospedagem? Stack implementada: TypeScript/React/API/PostgreSQL. Em 22/09/2026 o usuário definiu Contabo VPS com Easypanel e assumiu o deploy; aplicação web, sem app nativo. Plano/capacidade e contratação não foram informados. Afeta prazo e infraestrutura.

## Decisões antes do piloto

- **D05 — Qualidade temporal e uso.** Organizador: dados operacionais ou classificação esportiva? Proposta: MVP provisório/operacional; critérios de tempo oficial não definidos.
- **D06 — Dados e retenção.** Produto/responsável por dados: participantes, contratos, finalidade, canal de atendimento e prazos; validar propostas do documento 11.
- **D07 — Contingência.** Coordenação: responsáveis, papel/dispositivo reserva, energia e internet alternativas; ensaiar conciliação.
- **D08 — Recuperação e observabilidade.** Liderança: provedor consegue RPO/RTO? Definir alertas, plantão e teste de restore.

## Decisões antes das fases futuras

- **D09 — Resultados esportivos (F2).** Categorias, baterias, empates, penalidades, voltas, desclassificação e processo de contestação.
- **D10 — Comercial (F2/F6).** Assinatura ou evento, quotas, branding, suporte e cobrança; sem valores definidos.
- **D11 — IA e evidência (F3).** Câmeras, posição, número de peito, hardware, datasets, licenças, direito de uso e orçamento.
- **D12 — Qualidade automática (F4).** Envelope operacional, limiares, referência independente e amostra necessária.
- **D13 — Integrações/portal (F6).** Plataformas prioritárias, canais de notificação, dados públicos, app nativo e ordem de lançamento.

## Riscos principais e respostas

**R01 — Erro e lentidão humana; alto.** O teclado pode não acompanhar pelotões. Medir omissões e atraso no piloto; mais operadores e processo de contingência; limitar uso anunciado. Dono: operação.

**R02 — Perda de fila local; alto.** Navegador pode limpar dados ou aparelho falhar. Feedback explícito, sincronização frequente e pacote de recuperação; não vender armazenamento local como garantia absoluta. Dono: frontend/operação.

**R03 — Relógios divergentes; alto.** Separar instantes, estimar offset e revisar dados incertos. Erro humano não é corrigível automaticamente. Dono: backend/QA.

**R04 — Vazamento entre organizações; alto.** Escopo em API e banco, teste negativo em toda rota e revisão do pool de conexões. Dono: liderança técnica.

**R05 — Duplicidade/conflito; alto.** Idempotência transacional, observações preservadas e revisão com versão. Dono: backend.

**R06 — Crescimento do escopo; médio/alto.** Gates, P0/P1 e ADRs; não antecipar câmeras, rankings oficiais ou cobrança em F1. Dono: produto.

**R07 — Promessas de IA sem medição; alto.** Slides não demonstram benchmark; modo sombra, referência independente e limites por cenário. Dono: visão computacional/produto.

**R08 — Custo de mídia/GPU e licenças; alto em F3+.** Cotar, medir custo por ponto e revisar componentes/modelos/datasets antes de comercializar. Dono: liderança/produto.

**R09 — Resultado incoerente após correção; alto em F2+.** Versionar regras, recalcular projeções e republicar com histórico. Dono: backend/operação.

## Registro de decisão

Ao resolver cada Dxx, registrar data, responsável, decisão, justificativa e impactos nos documentos. Pendências críticas do gate seguinte precisam de solução ou adiamento explícito de escopo. Não interpretar ausência de resposta como aprovação de orçamento, coleta de vídeo ou publicação.

## Atualização da Sprint 00 — 16/09/2026

D01 e D02 confirmadas pelo usuário: corrida de rua, modalidade única sem voltas, números de até oito dígitos com zeros preservados e registro sem cadastro prévio. D03 permanece aberta quanto a escala e responsável; limites existentes são hipóteses de ensaio. D04 técnica concretizada na fundação com React/TypeScript, Vite, Fastify e PostgreSQL; equipe, hospedagem e orçamento pendentes. Ver [registro de execução](sprints/sprint-00-execucao.md).

## Atualização da Sprint 05

D04: hospedagem/plataforma definidas pelo usuário, deploy executado por ele. D05–D08 continuam abertos quanto ao aceite operacional, responsáveis, dados/retenção, contingência e configuração de recuperação/alertas na VPS. [Evidências e limites](sprints/sprint-05-execucao.md).
