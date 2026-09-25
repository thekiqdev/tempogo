# Plano técnico de evolução para IA

## Princípio

Manual, importação e IA produzem observações de passagem para o mesmo domínio. IA sugere candidatos com evidência; política de validação decide se podem compor a passagem efetiva. Não migrar a regra de negócio para o modelo e não substituir a auditoria existente.

## Pipeline futuro

1. Captura RTSP/IP no edge com timestamp, identidade da câmera e estado de sincronização.
2. Detecção de corredores e tracking dentro da câmera.
3. Localização do número de peito e OCR em múltiplos frames.
4. Associação temporal de evidências, com hipóteses alternativas preservadas.
5. Detecção de cruzamento da linha virtual por direção e região configuradas.
6. Candidato idempotente com câmera, track, instante, número sugerido, incerteza temporal, modelo e evidências.
7. Validação de escopo, plausibilidade, duplicidade e confiança calibrada.
8. Aceitação automática dentro de política validada ou revisão humana; resultado consome somente versão efetiva.

Tracking local não equivale a identidade global do atleta. O mesmo track pode ser perdido/recriado; checkpoints diferentes exigem associação por número/contexto e revisão de ambiguidades. Não usar reconhecimento facial.

## Contrato futuro de observação

Campos: `schema_version`, `source_event_id`, `organization_id` derivado da credencial de máquina, `event_id`, `checkpoint_id`, `camera_id`, `edge_device_id`, `track_id`, `crossing_at`, `received_at`, `clock_uncertainty_ms`, `bib_candidates`, `model_version`, `pipeline_version`, `evidence_refs`, `direction`, `quality_flags`.

Idempotência por fonte/evento/UUID, não somente track ID. Autenticação de máquina com escopo mínimo e rotação, sem reaproveitar senha de operador. Mídia privada com referência autenticada, integridade e retenção própria. Fila persistente no edge suporta reconexão e pressão de carga; indicar falhas de captura em vez de fabricar passagem.

## Dados e experimentação

Coletar diferentes eventos, formatos de número, tamanhos de pelotão, posições de câmera, oclusão, chuva e iluminação. Rotular número, corredor/track, linha/direção e instante de cruzamento com revisão de anotações. Guardar divergências e incerteza da referência.

Dividir treino/validação/teste por evento/sessão/corredor quando aplicável, não por frames aleatórios adjacentes, evitando vazamento. Conjunto final de teste fica separado do ajuste de limiar. Registrar origem/autorização de dados, versões, licenças e custo de anotação. Não usar automaticamente fotos de divulgação da apresentação como dataset.

## Métricas e gates propostos

- Precisão de identificação = passagens aceitas automaticamente com número correto ÷ todas as passagens aceitas automaticamente.
- Recall de passagem = cruzamentos reais corretamente recuperados ÷ cruzamentos rotulados na referência.
- Erro temporal absoluto p50/p95/p99 contra referência com precisão conhecida.
- Taxa de revisão, duplicação, troca de identidade, indisponibilidade e atraso de ingestão.
- Custo por câmera/hora e por passagem válida; throughput e uso de GPU/CPU por resolução/FPS.

Hipóteses iniciais para discutir antes do piloto automático: precisão ≥ 99,5%, recall ≥ 98%, erro temporal p95 ≤ 200 ms e revisão ≤ 10% **dentro do cenário testado**. Não são resultados alcançados, promessa de homologação ou exigências extraídas do PDF. Avaliar se são suficientes para o uso esportivo pretendido; podem precisar ser mais rigorosas.

Para G4, propor pelo menos três sessões independentes, total de 5.000 cruzamentos rotulados, com cenários adversos declarados. Reportar intervalos de confiança e amostra por cenário; atingir percentual global não compensa falha grave em um cenário. Tamanho final da amostra e limiares precisam ser justificados antes da coleta.

## Reconciliação e supervisão

Manual e IA podem observar a mesma passagem. Conservar as duas fontes, sugerir vínculo por contexto e janela de tempo e exigir revisão em conflito de número ou instante. Correção humana validada tem prioridade; novas inferências não a sobrescrevem. Registrar política, modelo e evidência que justificaram aceitação automática.

## Operação de modelos

Registro de modelo/dataset/métricas/licença, promoção explícita, canário por checkpoint, monitoração de qualidade e rollback rápido. Flags desligam automação mantendo captura manual. Reprocessamento cria novas observações/revisões, não altera resultados finalizados sem reabertura.

Antes de F3 selecionar câmeras e hardware; antes de F4 elaborar protocolo de montagem/calibração; antes de F5 entregar runbook de edge, retenção de mídia e plano de atualização de modelos. Essas especificações dependem do benchmark e não podem ser fechadas honestamente apenas pelo slide.
