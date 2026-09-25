# Runbook técnico e operação da corrida

## Responsáveis e canais

Nomear responsável técnico de plantão, coordenador da prova e responsável por dados. Registrar contatos, escala, aparelho reserva, energia e rede alternativa. Esses nomes ainda não foram fornecidos.

## Saúde, logs e métricas

- GET /api/v1/health/live: processo atendendo.
- GET /api/v1/health/ready: acesso ao banco; falha retorna 503.
- Respostas incluem X-Request-ID; logs de conclusão registram reqId, rota padronizada, método, status e duração, sem query string, cookies ou corpos.
- Auditoria persistente correlaciona a operação com request_id, organização, evento e ação.
- GET /api/v1/operations/metrics exige Bearer METRICS_TOKEN, somente na rede privada. Imagem web de produção bloqueia esse caminho. Sem token configurado, responde 404.
- Exporta contadores por rota/status, histogramas de latência, uptime e memória RSS. Os contadores reiniciam com o processo; coletar em monitor persistente.
- No painel administrativo, acompanhar contagens, filas e última comunicação por aparelho. Ausência de heartbeat há dois minutos indica estado desconhecido; não significa fila vazia.

Configurações preparadas: infra/monitoring/prometheus.yml e alerts.yml. Ajustar DNS interno e montar o token como segredo. Regras cobrem ausência de scrape, erros de ingestão >1% em janela de cinco minutos com pelo menos 100 requisições, e p95 >1 s sustentado. Readiness deve ser verificado também por sonda HTTP: scrape saudável não garante banco saudável.

Ainda faltam na VPS: instalação do coletor, destino/receptor de alertas, confirmação de recebimento pelo plantonista, monitor de disco/banco/WAL/backup e política de retenção dos logs. Não houve envio de mensagens externas.

## Limites de tráfego

Os limites HTTP existentes passaram a ser efetivamente aplicados depois da correção da ordem de registro do plugin. Padrão: 120/min; captura/sync: 600/min; login conserva os limites específicos e persistentes existentes.

A cota de campo usa credencial validada no banco (sessão/credencial não revogadas ou expiradas e organização ativa). Aparelhos diferentes na mesma rede não compartilham essa cota. Cookie inválido, inventado ou revogado e login usam o IP. O ensaio confirmou 429 após a cota e que cookies inventados não a reiniciam.

Uma réplica de API está prevista. Não confiar em X-Forwarded-For fornecido diretamente pelo cliente. A configuração atual não usa trustProxy irrestrito. O proxy pode agregar tentativas anônimas; validar os limites de login no ambiente real antes de operar.

Em 429 ou falha temporária, preservar fila e aguardar retry. Não gerar outro UUID para a mesma captura.

## Diagnóstico local

```powershell
npm run check
npm run test:integration
node --env-file=.env --import tsx tests/operations/faults.mjs
node tests/operations/rollback.mjs
node tests/operations/pitr-drill.mjs
```

O ensaio de falhas interrompe uma conexão TCP real ao banco de testes, mantendo a API viva, depois recupera a conexão; também encerra a API isolada e confirma detecção. Não para o banco compartilhado. Alertas foram avaliados localmente, sem receptor externo.

Na VPS, usar Logs/Shell do serviço no Easypanel. Não executar docker compose local como se representasse serviços gerenciados pelo painel.

## Antes da corrida

Admin: configurar evento/checkpoints/horário/fuso, emitir uma credencial por aparelho, validar validade suficiente e manter acesso à conciliação. Preparar os navegadores online e testar captura em evento sintético separado. Conferir bateria, relógio, espaço disponível, rede alternativa e legibilidade a 360 px.

Operador: abrir /checkpoint no navegador, entrar, preparar uso offline e conferir posto/aparelho. Instalar como atalho é opcional; não há aplicativo nativo. Não usar modo privado nem limpeza automática para a operação.

Registrar a versão do navegador e sistema em cada aparelho aprovado. A declaração “é web” não dispensa ensaio no Safari do iPhone e Chrome do Android.

## Durante

Manter a tela e o navegador ativos. Conferir confirmação local a cada número e pendências de envio. Se o app não conseguir salvar, o número fica no visor: recorrer ao procedimento manual e avisar a coordenação.

API/rede indisponível: continuar somente dentro da preparação válida; preservar fila/cache. Não reinstalar, não limpar dados, não trocar acesso para tentar resolver conexão.

Aparelho perdido: revogar credencial e registrar possibilidade de registros somente locais. Relógio suspeito: preservar o bruto, trocar aparelho se necessário e encaminhar revisão.

## Depois

Fechar coleta, verificar cada aparelho, enviar pendências e recuperar pacotes bloqueados com justificativa. Resolver duplicatas/horários/revisões, exportar CSV importando números como texto, conciliar e finalizar. Aparelho ausente exige exceção explícita; não concluir que está vazio.

Guias detalhados: [admin e acesso](22-admin-e-homologacao.md), [captura](24-captura-manual-e-acessos.md), [offline](26-offline-e-recuperacao.md) e [revisão/conciliação](28-painel-revisao-e-conciliacao.md).

## Ensaio e treinamento pendentes

Coordenador deve demonstrar uma captura, perda de rede, reconexão, revogação, exportação de pacote, revisão e conciliação. Registrar data, pessoas treinadas, resultados, aparelhos e contatos. Não há treinamento presencial ou aceite operacional registrado.
