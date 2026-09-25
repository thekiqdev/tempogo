# Estudo da proposta e rastreabilidade

## Material analisado

Fonte: [Cronometragem Inteligente — Presentation SaaS (1).pdf](../Cronometragem%20Inteligente%20-%20Presentation%20SaaS%20%281%29.pdf), 23 páginas. O arquivo é composto por imagens, sem texto extraível; as páginas foram inspecionadas visualmente. Alguns mockups já apresentam imagens ausentes e a página 14 corta a parte inferior do exemplo de voltas. Não se inferem requisitos de trechos invisíveis.

## Leitura completa

- **Páginas 1–2:** visão computacional aplicada a corridas; dificuldades com hardware especializado, logística, falta de visibilidade intermediária e auditoria manual.
- **Páginas 3–4:** câmera → detecção → tracking → OCR do número de peito → cruzamento de linha virtual → registro com timestamp no SaaS.
- **Página 5:** múltiplos checkpoints e processamento central, com exemplo de percurso de 10 km.
- **Página 6:** histórico de passagens do atleta, do início à chegada, com tempos por trecho e trilha auditável.
- **Páginas 7–8:** tempo bruto/líquido, pace, velocidade, posição geral/categoria e análise de evolução de ritmo.
- **Páginas 9–10:** tracking persistente, combinação de evidências em vários frames e revisão de casos de baixa confiança.
- **Página 11:** evidências visuais antes, durante e depois da passagem.
- **Páginas 12–13:** centro de operações, feed de passagens, estado das câmeras e mapa dos pontos.
- **Página 14:** circuitos com múltiplas voltas; exemplo anunciado de cinco voltas.
- **Página 15:** edge/GPU, tracking/OCR, motor de eventos e SaaS. Cita Python, OpenCV, PyTorch, ByteTrack/BoT-SORT, PaddleOCR/EasyOCR, ONNX Runtime, TensorRT, FastAPI/Node.js, PostgreSQL, Redis, Docker e Kubernetes como tecnologias avaliadas.
- **Página 16:** componentes abertos, especialização dos modelos, execução em edge e auditoria de licenças.
- **Página 17:** roadmap original começa pela IA na chegada, expande para checkpoints e termina na experiência do atleta.
- **Página 18:** portal/app, notificações, fotos/replay, rankings, integrações, detecção de não inscritos e alertas operacionais.
- **Página 19:** SaaS para organizações isoladas, personalização e receita por evento ou assinatura.
- **Página 20:** pilares de visão computacional, múltiplas câmeras, checkpoints e tempo real.
- **Página 21:** reforça o MVP original de uma câmera na chegada, seguido de múltiplos pontos e escala SaaS.
- **Página 22:** síntese da visão de transformar câmeras em infraestrutura de dados esportivos.
- **Página 23:** créditos de imagens; não contém requisito funcional adicional.

## Adaptação solicitada

O pedido atual muda expressamente as páginas 17 e 21: **o primeiro MVP será manual**. Não instalar detectores, OCR, pipeline de vídeo, GPU ou servidores de inferência nesta fase. Criar o núcleo que aceitará passagens de fontes distintas no futuro.

Rastreabilidade da visão até o plano:

- SaaS e isolamento (p. 5, 19) → organização no modelo desde o MVP; onboarding comercial e cobrança em F2.
- Checkpoints e histórico (p. 5–6) → RF-03/04/07/10 no MVP.
- Auditoria (p. 6, 11) → trilha textual no MVP; imagem/vídeo em F3–F5.
- Dashboard e tempo real (p. 12–13) → painel manual básico no MVP; mapas e saúde de câmeras em F5.
- Telemetria e rankings (p. 7–8) → cálculos básicos em F2; experiência completa em F6.
- Circuitos (p. 14) → F2; não interpretar repetição como volta automaticamente no MVP.
- Pipeline e evidências (p. 3–4, 9–11, 15–16) → contratos preparados no MVP, pesquisa F3, piloto F4 e produção F5.
- Portal, fotos, certificados, integrações e notificações (p. 17–18) → F6.
- Alertas de não inscritos e segurança (p. 18) → F6, condicionados à validação e revisão humana.

## O que a apresentação não define

Não há contratos de API, modelo de permissões, comportamento offline, regra de empate, política para números desconhecidos, limites de capacidade, orçamento ou equipe. Esses pontos são especificados como propostas nos documentos seguintes.

Percentuais de confiança, 60 FPS, latências e precisão de milissegundos exibidos são **ilustrativos**, sem relatório experimental. Não equivalem a acurácia, SLA ou compromisso de tempo oficial. A entrada manual tem atraso humano e deve ser apresentada como registro operacional provisório.
