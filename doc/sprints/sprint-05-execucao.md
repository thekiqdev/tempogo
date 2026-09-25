# Sprint 05 — Execução e entrega técnica local

Data: 22/09/2026. Entrega técnica local implementada e validada; homologação HTTPS repetida com sucesso após a última correção do frontend. O usuário definiu Contabo VPS com Easypanel e informou que fará o deploy pessoalmente. Não houve acesso à VPS ou publicação externa. A autorização para corrida real continua pendente dos critérios operacionais abaixo; a Sprint 06 não está automaticamente liberada.

## Mudanças

1. Corrigida a ordem de registro do plugin HTTP de rate limit: as rotas passaram a receber os hooks efetivamente. Limites numéricos existentes preservados, com cota por credencial de campo validada no servidor; login/cookies inválidos mantêm cota por IP. Testes confirmam 429 e resistência à rotação de cookies inventados.
2. Logs padronizados por rota, request ID, método, status e duração, sem query strings, cookies ou payloads. Métricas Prometheus protegidas por token e bloqueadas no frontend público de produção.
3. API recusa banco privilegiado com SUPERUSER/BYPASSRLS e exige membership do runtime. Provisionamento inicial de runtime preparado para o job de migration, separado da API.
4. Imagens de API/web preparadas para Easypanel, API como usuário node, domínio único e proxy privado. Nenhum aplicativo nativo e nenhuma IA adicionados.
5. Corrigida resposta atrasada ao trocar checkpoint na aba Acessos: a consulta anterior podia apagar a lista do ponto selecionado e ocultar o botão de revogação. Regressão reproduz atraso intencional e confirma o comportamento corrigido.
6. Corrigido atraso de sincronização quando uma captura chega durante a consulta inicial do histórico: a fila passa a agendar nova tentativa curta sem perder a notificação de captura. O teste da Sprint 04 segura a resposta inicial, salva o número e exige confirmação em até cinco segundos após liberar a resposta. Falhas de rede continuam respeitando backoff.
7. Ferramentas reproduzíveis de carga, falha de conexão, backup/PITR, rollback e identificação da candidata.

## Verificação funcional e segurança

npm run check aprovado: lint, tipos, nove testes unitários e build. npm run test:integration: 44 testes aprovados, incluindo agrupamentos node:test.

Regressão:
- T01–T05, T07–T10: autenticação, tenants, configuração, validação, idempotência, revogação/recuperação, duplicatas, revisão e CSV cobertos pelas suítes e jornadas das Sprints 01, 02 e 04.
- T06: 1.000 itens em navegador desktop com viewport móvel, reload offline, sincronização e comparação de payloads/UUIDs. Ensaio atual teve 33 s offline; o ensaio anterior da Sprint 03 comprova 30 min nesse computador, não em aparelhos reais.
- T11: viewport 360 px sem overflow, desktop Edge 153.0.4234.48 e foco/teclado na regressão. Chrome Android, Safari iOS físicos, leitor de tela e condições de prova permanecem pendentes.
- T12: salto de relógio, referência antiga, expiração, reabertura/janela e upload tardio cobertos por testes unitários/integração e sprint-03-edge. Não houve ensaio físico cruzando meia-noite ou mudança de fuso nos aparelhos.
- T13: restauração física real com WAL até instante alvo e integridade/RLS conferidas em containers isolados.
- T14: canários em query/cookies/Authorization e request ID não aparecem nos logs nem métricas; imagem de produção testada com endpoint de métricas privado.
- T15 não executado: participantes mínimos continuam adiados para F2.

Uma tentativa inicial de aumentar limites globais foi rejeitada pela revisão automática e não foi aplicada. A solução implementada conserva os valores e separa apenas identidades de campo já validadas.

## Carga e latência

Ensaio HTTP real com PostgreSQL local Docker, uma API Node e pool de cinco conexões. Dados sintéticos: 20 credenciais/sessões, 10 checkpoints, 1.000 números; aparelhos compartilham o mesmo IP. As sessões foram criadas previamente para isolar ingestão: o ensaio não mede login coletivo.

- Carga contínua: 18.000 capturas, 20/s, janela nominal de 900 s; duração observada 899,98 s.
- Reconexão: 20.000 capturas (1.000 por aparelho), concorrência máxima de uma requisição por aparelho, ritmo limitado; duração de 299,93 s.
- Total: 38.000 observações e 38.000 UUIDs distintos; nenhuma perda, erro ou duplicata técnica. Vinte replays adicionais devolveram a observação existente.
- API contínua: p50 12,28 ms; p95 16,40 ms; p99 20,38 ms; máximo 136,98 ms.
- API reconexão: p50 12,28 ms; p95 20,97 ms; p99 27,82 ms.
- Painel simultâneo: 119 consultas; p95 431 ms.
- Feedback local: p95 43,22 ms em 1.000 capturas no navegador a 360 px, medido de Enter à limpeza após persistência local, incluindo custo de automação.
- Relatório guarda RSS/conexões/esperas e CPU do processo de ensaio (cliente e API no mesmo processo). Não representa CPU exclusiva da VPS ou do banco.

Metas de latência atingidas nesse computador. Repetir ensaio no hardware/rede contratados antes de prometer capacidade em produção. Arquivo: tmp/sprint-05/load-900.json.

## Restauração, falhas e rollback

PITR: backup cifrado, adulteração rejeitada e WAL aplicado; transação posterior ao alvo excluída. 1.000 observações, 1.000 auditorias, uma revisão e hashes preservados. Restauração em 5,80 s; diferença controlada dos marcadores de 1,566 s. Não comprova recuperação da VPS perdida nem arquivo externo contínuo. [Detalhes](../31-backup-e-restauracao.md).

Falha: corte de proxy TCP real para banco de testes fez readiness retornar indisponível sem derrubar liveness. Restabelecer conexão recuperou readiness. Encerrar a API isolada produziu estado API_UNAVAILABLE. Avaliação de limiar de erro ensaiada, sem envio externo.

Rollback: API anterior restaurada em 2,31 s, consulta administrativa autorizada funcionando, 2.211 passagens e seus hashes preservados, sem downgrade de banco; candidata restabelecida em finally. Não representa teste de downgrade arbitrário de schemas futuros.

## Homologação final repetida — 22/09/2026

Docker restabelecido pelo usuário. Ambiente reconstruído com npm run homolog:up e migrações concluídas. API, PostgreSQL e frontend disponíveis em HTTPS local. A correção de sincronização foi validada pela jornada Sprint 04, que retém a resposta inicial do histórico, salva uma captura e exige confirmação após liberar a resposta.

- npm run check: lint, tipos, nove testes unitários e build aprovados.
- npm run test:integration: 44 testes aprovados em PostgreSQL real.
- Jornadas HTTPS das Sprints 01, 02, 04 e sprint-03-edge aprovadas.
- Sprint 03: 1.000 capturas, 33 segundos offline, reload, payloads preservados, 1.000 IDs remotos únicos, zero uploads após revogação e zero erros JavaScript. Viewport 360 px no Edge 153.0.4234.48; feedback local p95 43,22 ms. Não substitui ensaio físico de 30 minutos em celulares.
- Teste controlado sync-wakeup aprovado novamente com frontend compilado e IndexedDB reais/API simulada: confirmação em 2,35 s.
- Imagem web de produção reconstruída e smoke aprovado: API com usuário node, métricas privadas 200, acesso público às métricas 404, sem canários de segredo nos logs.
- Manifesto sprint-05-593eea0a65e3 conferido: nenhum arquivo de fonte divergente.

Na execução consecutiva, as automações atingiram as cotas de requisições administrativas e recuperação de senha. As jornadas afetadas foram repetidas após a janela e com a segunda conta sintética, sem aumentar limites. Durante o envio dos 1.000 itens, respostas 429 provocaram espera e retomada automática; a fila concluiu sem perdas. Manter intervalo mínimo de 65 segundos entre jornadas administrativas e distribuir recuperações de senha entre contas sintéticas; a cota por email é cinco em 15 minutos.

Carga de 38.000 registros, PITR, falhas e rollback descritos acima são evidências da execução anterior. Não foram repetidos nesta rodada de regressão do frontend.

## Candidata e artefatos

Identificação por hash de conteúdo em [manifesto da candidata](../releases/sprint-05-candidate.json); não depende de um commit Git não criado. Imagens locais cronocheckpoint-api:sprint05-candidate e cronocheckpoint-web:sprint05-candidate; os digests atualizados estão no relatório de smoke das imagens. A imagem web inclui a última correção; o manifesto identifica as fontes atuais.

Artefatos ignorados pelo Git:
- tmp/sprint-05/sync-wakeup.json (API simulada, navegador e armazenamento reais)
- tmp/sprint-05/load-900.json
- tmp/sprint-05/pitr-ea4a5fc7/result.json
- tmp/sprint-05/faults.json
- tmp/sprint-05/rollback.json
- tmp/sprint-05/production-images.json
- tmp/sprint-05/offline/homolog/result.json
- tmp/sprint-02/homolog/result.json (inclui regressão de acesso atrasado)
- tmp/sprint-04/homolog/result.json
- tmp/sprint-03-edge/homolog/result.json

## Decisão de aptidão

Candidata implementada para o usuário implantar e validar no seu ambiente, com homologação local concluída conforme seção acima. **Não autorizada ainda para uso em corrida real.** Faltam:

- Deploy do usuário na VPS, TLS público, SMTP, limites/recursos, contas operacionais e MFA dos acessos à plataforma.
- Backup/WAL externo com custódia separada da chave, medição RPO/RTO e alertas efetivamente recebidos pelo plantonista.
- Navegadores/aparelhos Android e iPhone reais, 1.000 itens por aparelho/30 minutos offline, legibilidade e condições de campo.
- Responsáveis, treinamento, retenção/finalidade dos dados, contingência e aceite da coordenação (D05–D08).
- Conferência do login compartilhando rede: limite de campo continua 20 tentativas/15 min por IP; preparar acessos com antecedência e ensaiar a logística real.

Esses itens não são defeitos de teste local resolvidos por documentação; são condições ainda não demonstradas. O usuário assumiu o deploy, não declarou atendidas as condições do piloto.

Guias entregues: [Contabo/Easypanel](../30-deploy-contabo-easypanel.md), [backup](../31-backup-e-restauracao.md), [runbook](../32-runbook-e-monitoramento.md).
