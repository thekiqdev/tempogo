# Sprint 05 — Qualidade e preparação operacional

Status: entrega técnica local validada, com homologação HTTPS final concluída em 22/09/2026; condições externas de liberação pendentes. O usuário executará o deploy Contabo/Easypanel. Ver [execução e evidências](sprint-05-execucao.md). Duração proposta: 2 semanas. Fase F1; backlog B9. Responsáveis: liderança técnica, QA, desenvolvimento e coordenação.

## Objetivo e incremento

Transformar o candidato funcional em uma versão apta ao piloto: segurança verificada, capacidade medida, restauração demonstrada e equipe preparada para falhas. Esta sprint verifica e completa controles iniciados anteriormente.

## Entrada

Sprints 01–04 aceitas, P0 funcional e versão identificável em homologação. Ler [qualidade](../12-qualidade-e-testes.md), [infraestrutura](../13-infraestrutura-e-operacao.md) e [segurança](../11-seguranca-e-privacidade.md).

## Tarefas

- [ ] S05-01 — QA/desenvolvimento: executar regressão integrada T01–T14; T15 somente se participantes implementados. Resolver falhas críticas e reexecutar cenários afetados.
- [ ] S05-02 — QA: dispositivos reais Chrome Android, Safari iOS e desktop; registrar versões, foco, teclado, 360 px, botões, legibilidade e sessões longas.
- [x] S05-03 — QA/backend: carga de 20 dispositivos/20 capturas por segundo por 15 minutos e burst de reconexão; medir latência, erros, banco, duplicatas e completude.
- [ ] S05-04 — QA/frontend: 1.000 itens por dispositivo e 30 minutos offline nos aparelhos-alvo; quota, reload, reconexão, fila bloqueada e migração de cache.
- [ ] S05-05 — Liderança: consolidar TLS, segredos, acesso de produção, sessões, CSRF, rate limit, RLS/escopo e ausência de segredos em logs; MFA para operação da plataforma conforme plano.
- [ ] S05-06 — Operação técnica: configurar backup/PITR, restaurar em ambiente isolado e medir RPO/RTO; registrar lacunas se o provedor não atingir a meta.
- [ ] S05-07 — Liderança: completar métricas, alertas, logs correlacionados e procedimento de resposta; ensaiar falha de API/banco e rollback compatível.
- [ ] S05-08 — Operação/produto: resolver D05–D08, validar tratamento/retenção de dados, responsáveis, contingência, aparelhos reserva e logística do piloto.
- [ ] S05-09 — Desenvolvimento/operação: produzir guias de admin/operador, deploy/rollback e runbook com comandos reais; treinar coordenação.
- [x] S05-10 — QA/produto: registrar decisão de aptidão para piloto, limitações, defeitos remanescentes e versão candidata.

## Situação dos itens abertos

S05-01: regressão automatizada concluída; matriz física/temporal integral ainda não. S05-02 e S05-04: navegador desktop/360 px validado, aparelhos reais pendentes. S05-05: controles da aplicação testados; TLS/MFA/segredos da VPS ficam com o usuário. S05-06: PITR local demonstrado, backup externo e RPO/RTO da VPS pendentes. S05-07: métricas, regras e falhas/rollback locais entregues; receptores/monitoramento de produção pendentes. S05-08: D05–D08 ainda exigem responsáveis e aceite. S05-09: guias entregues, treinamento ainda não registrado. S05-10 registra candidata técnica e decisão de não liberar corrida real ainda.

## Critérios de aceite

1. Nenhuma falha crítica de isolamento, perda, duplicação, autenticação ou recuperação permanece aberta.
2. Metas propostas de RNF-02: feedback local p95 ≤ 200 ms e confirmação API p95 ≤ 1 s no ensaio controlado; números medidos, sem extrapolação para rede móvel.
3. RNF-06 demonstrado nos aparelhos previstos; após conciliação, nenhuma perda/duplicata técnica no roteiro.
4. Restauração executada e integridade conferida; metas RPO ≤ 5 min/RTO ≤ 60 min atendidas ou formalmente revisadas pelo responsável antes do piloto, com documentação coerente.
5. Alertas e rollback demonstrados; runbook executável por pessoa designada.
6. Decisões operacionais e de dados necessárias ao piloto resolvidas; aplicação continua sem IA.

## Evidências e demonstração

Relatório de testes por cenário, carga com configuração e percentis, dispositivos/versões, restore com duração/perda medida, simulação de alerta e checklist operacional. Demonstrar falha e recuperação além do caminho feliz.

## Entregáveis e saída

Release candidate identificada, ambiente de piloto preparado e autorização operacional registrada. Metas não demonstradas não podem constar como atingidas. Falhas bloqueantes adiam a Sprint 06; disponibilidade de data não substitui prontidão técnica.

Próxima: [Sprint 06](sprint-06-piloto-e-entrega.md). Aplicar a definição comum de pronto do [índice](README.md).
